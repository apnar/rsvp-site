import {
	and,
	asc,
	count,
	eq,
	inArray,
	isNotNull,
	isNull,
	ne,
	or,
	type SQL,
	sql,
} from "drizzle-orm";

import { bookByPhone } from "./address-book";
import { normalizeEmail } from "./addresses";
import { batchAll, insertChunks, mapChunks } from "./batch";
import { detailColumns, dietColumns, fillBlanks } from "./details";
import { dietsOf } from "./diets";
import { isUniqueViolation } from "./errors";
import type { Db } from "./index";
import { displayName, nameFor } from "./names";
import { textablePhone } from "./phone";
import { roleOf } from "./roles";
import { NO_EMAIL_DOMAIN, type PersonSource, user } from "./schema/auth";
import { newToken } from "./tokens";

// What callers have always imported from here: the pieces that moved out
// are re-exported, so splitting the file broke nobody.
export * from "./addresses";
export * from "./status";
export * from "./tokens";

/** Not thrown out. `banned` is nullable, so never compare it with `= 0`. */
export function notDeactivated() {
	return and(
		ne(user.status, "deactivated"),
		or(isNull(user.banned), eq(user.banned, false)),
	);
}

/**
 * Somebody email may go to: not deactivated, not unsubscribed, and with a
 * real address -- a name-only paper guest's placeholder is never mailed.
 */
export function mailableWhere() {
	return and(
		notDeactivated(),
		isNull(user.unsubscribedAt),
		eq(user.noEmail, false),
	);
}

/**
 * Somebody a text may go to: not deactivated, a US mobile-shaped number,
 * the consent on record, texts not switched off, and the number not
 * blocked. The block is matched by hand-qualified names on purpose: drizzle
 * leaves a single-table query's columns unqualified, and inside the
 * subquery `"phone"` would mean sms_block's own.
 */
export function textableWhere() {
	return and(
		notDeactivated(),
		// The shape, loosely: D1 refuses a GLOB spelling out every digit as
		// "too complex", and `listTextable` checks the number exactly.
		sql`"user"."phone" like '+1%' and length("user"."phone") = 12`,
		isNotNull(user.textsOkAt),
		isNull(user.textsOffAt),
		sql`not exists (select 1 from "sms_block" "b" where "b"."phone" = "user"."phone")`,
	);
}

/**
 * New people known only by name, for paper invitations. Each gets a unique
 * placeholder address (the column is NOT NULL UNIQUE) and `no_email`, so
 * nothing mails them; their printed QR code is their way in. Never deduped:
 * two "Dana"s are two people until a host says otherwise.
 */
export async function createNameOnlyPeople(
	db: Db,
	people: readonly Typed[],
	source: PersonSource,
): Promise<{ id: string; name: string }[]> {
	const rows = people.map((p) => {
		const firstName = p.firstName ?? "";
		const lastName = p.lastName ?? "";
		return {
			id: crypto.randomUUID(),
			name: displayName(firstName, lastName),
			firstName,
			lastName,
			phone: p.phone ?? null,
			email: `${crypto.randomUUID()}@${NO_EMAIL_DOMAIN}`,
			emailVerified: false,
			noEmail: true,
			role: "user",
			source,
			linkToken: newToken(),
			unsubscribeToken: newToken(),
		};
	});
	await batchAll(
		db,
		insertChunks(user, rows).map((slice) => db.insert(user).values(slice)),
	);
	return rows.map((r) => ({ id: r.id, name: r.name }));
}

/**
 * People a host typed with a name and no address: somebody already in the
 * host's book with that number is that person (texting the same phone as
 * two guests helps nobody), and the rest are new name-only people.
 */
export async function nameOnlyFromBook(
	db: Db,
	ownerId: string,
	people: readonly Typed[],
	source: PersonSource,
): Promise<{ id: string; name: string; phone: string | null }[]> {
	const known = await bookByPhone(
		db,
		ownerId,
		people.flatMap((p) => (p.phone ? [p.phone] : [])),
	);
	const fresh = people.filter((p) => !(p.phone && known.has(p.phone)));
	const made = await createNameOnlyPeople(db, fresh, source);
	const madeOut = made.map((m, i) => ({
		...m,
		phone: fresh[i]?.phone ?? null,
	}));
	const reused = people.flatMap((p) => {
		const id = p.phone ? known.get(p.phone) : undefined;
		return id && p.phone
			? [
					{
						id,
						name: displayName(p.firstName ?? "", p.lastName ?? ""),
						phone: p.phone,
					},
				]
			: [];
	});
	return [...reused, ...madeOut];
}

/**
 * Give a name-only guest a real address. Refused when that address already
 * belongs to somebody: merging two people is a host's call to make by hand
 * (remove this one, invite that one), not something to guess at.
 */
export async function setRealEmail(
	db: Db,
	userId: string,
	raw: string,
): Promise<"ok" | "taken" | "not-placeholder"> {
	const email = normalizeEmail(raw);
	const taken = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, email))
		.get();
	if (taken) return "taken";
	try {
		const result = await db
			.update(user)
			.set({ email, noEmail: false })
			.where(and(eq(user.id, userId), eq(user.noEmail, true)))
			.run();
		return result.meta.changes === 1 ? "ok" : "not-placeholder";
	} catch (error) {
		// Somebody took the address between the check and the write.
		if (isUniqueViolation(error)) return "taken";
		throw error;
	}
}

const personColumns = {
	id: user.id,
	name: user.name,
	image: user.image,
	...detailColumns,
	...dietColumns,
	claimedAt: user.claimedAt,
	email: user.email,
	emailVerified: user.emailVerified,
	role: user.role,
	source: user.source,
	status: user.status,
	statusChangedAt: user.statusChangedAt,
	statusChangedBy: user.statusChangedBy,
	unsubscribedAt: user.unsubscribedAt,
	unsubscribeReason: user.unsubscribeReason,
	noEmail: user.noEmail,
	contactBy: user.contactBy,
	alertsBy: user.alertsBy,
	textsOkAt: user.textsOkAt,
	textsOffAt: user.textsOffAt,
	linkSentAt: user.linkSentAt,
	createdAt: user.createdAt,
};

/**
 * A row as people are shown: the role read through `roleOf`, since the
 * column is free text, and a name-only guest's placeholder address blanked.
 */
function present<
	T extends {
		role: string | null;
		email: string;
		noEmail: boolean;
		diets: unknown;
	},
>(row: T) {
	return {
		...row,
		role: roleOf(row.role),
		email: row.noEmail ? "" : row.email,
		diets: dietsOf(row.diets),
	};
}

type PersonRow = Pick<typeof user.$inferSelect, keyof typeof personColumns>;

export type Person = ReturnType<typeof present<PersonRow>>;

/** Everybody, oldest first. */
export async function listPeople(db: Db): Promise<Person[]> {
	const rows = await db
		.select(personColumns)
		.from(user)
		.orderBy(asc(user.createdAt))
		.all();
	return rows.map(present);
}

/** One person's own record, re-read from D1 rather than the session cookie. */
export async function findPerson(db: Db, id: string): Promise<Person | null> {
	const row = await db
		.select(personColumns)
		.from(user)
		.where(eq(user.id, id))
		.get();
	return row ? present(row) : null;
}

const recipientColumns = {
	id: user.id,
	email: user.email,
	name: user.name,
	unsubscribeToken: user.unsubscribeToken,
	linkToken: user.linkToken,
};

export type Recipient = Pick<
	typeof user.$inferSelect,
	keyof typeof recipientColumns
>;

/**
 * The people email may go to, oldest first: everybody, or just these ids.
 * Deactivated and unsubscribed people are never in it, whatever was asked.
 */
export async function listRecipients(
	db: Db,
	onlyIds?: readonly string[],
): Promise<Recipient[]> {
	if (onlyIds && onlyIds.length === 0) return [];
	const read = (where: SQL | undefined) =>
		db
			.select(recipientColumns)
			.from(user)
			.where(where)
			.orderBy(asc(user.createdAt))
			.all();
	if (!onlyIds) return read(mailableWhere());
	// D1 caps bound parameters per statement, so long id lists go in slices.
	return mapChunks(onlyIds, (ids) =>
		read(and(mailableWhere(), inArray(user.id, ids))),
	);
}

const textableColumns = {
	id: user.id,
	name: user.name,
	firstName: user.firstName,
	phone: user.phone,
	linkToken: user.linkToken,
};

export type TextRecipient = Pick<
	typeof user.$inferSelect,
	keyof typeof textableColumns
> & { phone: string };

/**
 * `listRecipients` for texts: these people, those of them a text may go to
 * (`textableWhere`). Whether they want one is `channelsFor`'s question.
 */
export async function listTextable(
	db: Db,
	ids: readonly string[],
): Promise<TextRecipient[]> {
	const rows = await mapChunks(ids, (slice) =>
		db
			.select(textableColumns)
			.from(user)
			.where(and(textableWhere(), inArray(user.id, slice)))
			.orderBy(asc(user.createdAt))
			.all(),
	);
	return rows.flatMap((r) => {
		const phone = textablePhone(r.phone);
		return phone ? [{ ...r, phone }] : [];
	});
}

/** How many people a send to everybody would reach, without reading them. */
export async function countRecipients(db: Db): Promise<number> {
	const row = await db
		.select({ n: count() })
		.from(user)
		.where(mailableWhere())
		.get();
	return row?.n ?? 0;
}

/** Somebody who could still be sent a sign-in link, by address. */
export async function findReachablePersonByEmail(db: Db, email: string) {
	const row = await db
		.select({ id: user.id, linkSentAt: user.linkSentAt })
		.from(user)
		.where(and(eq(user.email, normalizeEmail(email)), notDeactivated()))
		.get();
	return row ?? null;
}

/** Record that a sign-in link just went out, for the request cooldown. */
export async function markLinkSent(db: Db, id: string): Promise<void> {
	await db.update(user).set({ linkSentAt: new Date() }).where(eq(user.id, id));
}

export type FoundPerson = Awaited<ReturnType<typeof selectByEmail>>[number] & {
	created: boolean;
};

/** What somebody typed about a person, all of it optional. */
export type Typed = {
	firstName?: string;
	lastName?: string;
	phone?: string | null;
};

/**
 * The people behind these addresses, creating a plain `user` for each one
 * nobody has used yet. This is how anybody gets an account now: a host types
 * an address, or a stranger types theirs on a share link.
 *
 * Rows are written straight to D1 rather than through Better Auth's
 * `createUser`, which is an admin endpoint that refuses hosts. Both tokens
 * go in with the insert, so there is no moment when a person exists with no
 * way in -- the same promise `stampTokens` keeps for rows Better Auth makes.
 * A name or phone typed for somebody who already exists only fills a blank
 * (`fillBlanks`). Deactivated people come back as found, never revived;
 * callers skip them.
 */
export async function findOrCreatePeople(
	db: Db,
	entries: readonly (string | ({ email: string } & Typed))[],
	source: PersonSource,
): Promise<FoundPerson[]> {
	const typed = new Map<string, Typed>();
	for (const e of entries) {
		if (typeof e !== "string" && (e.firstName || e.phone))
			typed.set(normalizeEmail(e.email), e);
	}
	const wanted = [
		...new Set(
			entries.map((e) => normalizeEmail(typeof e === "string" ? e : e.email)),
		),
	].filter(Boolean);
	if (wanted.length === 0) return [];
	const before = await selectByEmail(db, wanted);
	const known = new Set(before.map((p) => p.email));
	const missing = wanted.filter((email) => !known.has(email));
	const newRows = missing.map((email) => {
		const t = typed.get(email);
		const firstName = t?.firstName ?? "";
		const lastName = t?.lastName ?? "";
		return {
			id: crypto.randomUUID(),
			email,
			name: nameFor(firstName, lastName, email),
			firstName,
			lastName,
			phone: t?.phone ?? null,
			emailVerified: false,
			role: "user",
			source,
			linkToken: newToken(),
			unsubscribeToken: newToken(),
		};
	});
	// One batch: one round trip, and a long list lands whole or not at all.
	await batchAll(
		db,
		insertChunks(user, newRows).map((slice) =>
			db
				.insert(user)
				.values(slice)
				// Two hosts adding the same stranger at once: the loser's row is
				// dropped and the re-read below finds the winner's.
				.onConflictDoNothing({ target: user.email }),
		),
	);
	await fillBlanks(
		db,
		before.flatMap((p) => {
			const t = typed.get(p.email);
			return t && p.status !== "deactivated"
				? [{ id: p.id, email: p.email, typed: t }]
				: [];
		}),
	);
	const after = missing.length ? await selectByEmail(db, wanted) : before;
	const order = new Map(wanted.map((email, i) => [email, i]));
	return after
		.map((p) => ({ ...p, created: !known.has(p.email) }))
		.sort((a, b) => (order.get(a.email) ?? 0) - (order.get(b.email) ?? 0));
}

function selectByEmail(db: Db, emails: string[]) {
	return mapChunks(emails, (slice) =>
		db
			.select({
				id: user.id,
				email: user.email,
				name: user.name,
				status: user.status,
			})
			.from(user)
			.where(inArray(user.email, slice))
			.all(),
	);
}

export type {
	PersonSource,
	PersonStatus,
	Role,
	StatusActor,
} from "./schema/auth";
