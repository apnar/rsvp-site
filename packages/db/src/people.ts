import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm";

import type { createDb } from "./index";
import { roleOf } from "./roles";
import {
	type PersonSource,
	type PersonStatus,
	type Role,
	type StatusActor,
	type UnsubscribeReason,
	user,
} from "./schema/auth";

type Db = ReturnType<typeof createDb>;

/** The form every address is stored and looked up in. */
export function normalizeEmail(raw: string): string {
	return raw.trim().toLowerCase();
}

/**
 * Pull addresses out of whatever a host pasted: commas, semicolons, new
 * lines, "Name <a@b.c>". Lower-cased and deduplicated, in the order given.
 * Anything without an @ and a dot after it is dropped rather than guessed at.
 */
export function parseEmails(raw: string): string[] {
	return parseAddresses(raw).map((a) => a.email);
}

const ADDRESS = /[^\s<>,;"']+@[^\s<>,;"']+\.[^\s<>,;"']+/g;

/**
 * The same, keeping the name a mail client puts in front of an address --
 * `"Linh Nguyen" <linh@x.com>` or `Linh Nguyen <linh@x.com>` -- so a pasted
 * list makes accounts with real names rather than the part before the @.
 */
export function parseAddresses(
	raw: string,
): { email: string; name: string | null }[] {
	const seen = new Set<string>();
	const out: { email: string; name: string | null }[] = [];
	let last = 0;
	for (const match of raw.matchAll(ADDRESS)) {
		const start = match.index ?? 0;
		// Whatever sits between the previous address and this one, after the
		// last separator, is this one's name -- if it is in angle brackets.
		const before = raw.slice(last, start);
		last = start + match[0].length;
		const email = normalizeEmail(match[0]);
		if (seen.has(email)) continue;
		seen.add(email);
		const bracketed = before.trimEnd().endsWith("<");
		const name = bracketed
			? (before.split(/[,;\n]/).at(-1) ?? "").replace(/[<>"']/g, "").trim()
			: "";
		out.push({ email, name: name && name.length <= 60 ? name : null });
	}
	return out;
}

/** A fresh token: 32 hex characters, unguessable. */
export function newToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Not thrown out. `banned` is nullable, so never compare it with `= 0`. */
export function notDeactivated() {
	return and(
		ne(user.status, "deactivated"),
		or(isNull(user.banned), eq(user.banned, false)),
	);
}

/** Somebody email may go to: not deactivated, and not unsubscribed. */
export function mailableWhere() {
	return and(notDeactivated(), isNull(user.unsubscribedAt));
}

export type Person = {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	role: Role;
	source: PersonSource;
	status: PersonStatus;
	statusChangedAt: Date | null;
	statusChangedBy: StatusActor | null;
	unsubscribedAt: Date | null;
	unsubscribeReason: UnsubscribeReason | null;
	linkSentAt: Date | null;
	createdAt: Date;
};

const personColumns = {
	id: user.id,
	name: user.name,
	email: user.email,
	emailVerified: user.emailVerified,
	role: user.role,
	source: user.source,
	status: user.status,
	statusChangedAt: user.statusChangedAt,
	statusChangedBy: user.statusChangedBy,
	unsubscribedAt: user.unsubscribedAt,
	unsubscribeReason: user.unsubscribeReason,
	linkSentAt: user.linkSentAt,
	createdAt: user.createdAt,
};

/** Everybody, oldest first. */
export async function listPeople(db: Db): Promise<Person[]> {
	const rows = await db
		.select(personColumns)
		.from(user)
		.orderBy(asc(user.createdAt))
		.all();
	return rows.map((row) => ({ ...row, role: roleOf(row.role) }));
}

/** One person's own record, re-read from D1 rather than the session cookie. */
export async function findPerson(db: Db, id: string): Promise<Person | null> {
	const row = await db
		.select(personColumns)
		.from(user)
		.where(eq(user.id, id))
		.get();
	return row ? { ...row, role: roleOf(row.role) } : null;
}

export type Recipient = {
	id: string;
	email: string;
	name: string | null;
	unsubscribeToken: string | null;
	linkToken: string | null;
};

const recipientColumns = {
	id: user.id,
	email: user.email,
	name: user.name,
	unsubscribeToken: user.unsubscribeToken,
	linkToken: user.linkToken,
};

/**
 * The people email may go to, oldest first: everybody, or just these ids.
 * Deactivated and unsubscribed people are never in it, whatever was asked.
 */
export async function listRecipients(
	db: Db,
	onlyIds?: readonly string[],
): Promise<Recipient[]> {
	if (onlyIds && onlyIds.length === 0) return [];
	const rows: Recipient[] = [];
	// D1 caps bound parameters per statement, so long id lists go in slices.
	const slices = onlyIds ? chunk(onlyIds, 90) : [undefined];
	for (const ids of slices) {
		const where = ids
			? and(mailableWhere(), inArray(user.id, ids))
			: mailableWhere();
		rows.push(
			...(await db
				.select(recipientColumns)
				.from(user)
				.where(where)
				.orderBy(asc(user.createdAt))
				.all()),
		);
	}
	return rows;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		out.push(items.slice(i, i + size));
	}
	return out;
}

export type LinkPerson = {
	id: string;
	email: string;
	name: string;
	emailVerified: boolean;
	status: PersonStatus;
};

/** Who a sign-in link belongs to. Null when the token means nothing. */
export async function findPersonByLinkToken(
	db: Db,
	token: string,
): Promise<LinkPerson | null> {
	const row = await db
		.select({
			id: user.id,
			email: user.email,
			name: user.name,
			emailVerified: user.emailVerified,
			status: user.status,
		})
		.from(user)
		.where(eq(user.linkToken, token))
		.get();
	return row ?? null;
}

/** Somebody who could still be sent a sign-in link, by address. */
export async function findReachablePersonByEmail(
	db: Db,
	email: string,
): Promise<{
	id: string;
	linkSentAt: Date | null;
	unsubscribedAt: Date | null;
} | null> {
	const row = await db
		.select({
			id: user.id,
			linkSentAt: user.linkSentAt,
			unsubscribedAt: user.unsubscribedAt,
		})
		.from(user)
		.where(and(eq(user.email, normalizeEmail(email)), notDeactivated()))
		.get();
	return row ?? null;
}

export type FoundPerson = {
	id: string;
	email: string;
	name: string;
	status: PersonStatus;
	created: boolean;
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
 * Deactivated people come back as found, never revived; callers skip them.
 */
export async function findOrCreatePeople(
	db: Db,
	entries: readonly (string | { email: string; name: string | null })[],
	source: PersonSource,
): Promise<FoundPerson[]> {
	const names = new Map<string, string>();
	for (const e of entries) {
		if (typeof e !== "string" && e.name)
			names.set(normalizeEmail(e.email), e.name);
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
	for (const slice of chunk(missing, 8)) {
		await db
			.insert(user)
			.values(
				slice.map((email) => ({
					id: crypto.randomUUID(),
					email,
					name: names.get(email) ?? email.split("@")[0] ?? email,
					emailVerified: false,
					role: "user",
					source,
					linkToken: newToken(),
					unsubscribeToken: newToken(),
				})),
			)
			// Two hosts adding the same stranger at once: the loser's row is
			// dropped and the re-read below finds the winner's.
			.onConflictDoNothing({ target: user.email });
	}
	const after = missing.length ? await selectByEmail(db, wanted) : before;
	const order = new Map(wanted.map((email, i) => [email, i]));
	return after
		.map((p) => ({ ...p, created: !known.has(p.email) }))
		.sort((a, b) => (order.get(a.email) ?? 0) - (order.get(b.email) ?? 0));
}

async function selectByEmail(db: Db, emails: string[]) {
	const rows: Omit<FoundPerson, "created">[] = [];
	for (const slice of chunk(emails, 90)) {
		rows.push(
			...(await db
				.select({
					id: user.id,
					email: user.email,
					name: user.name,
					status: user.status,
				})
				.from(user)
				.where(inArray(user.email, slice))
				.all()),
		);
	}
	return rows;
}

/** The sign-in token for a person, generating one if the row predates them. */
export async function ensureLinkToken(db: Db, id: string): Promise<string> {
	const row = await db
		.select({ linkToken: user.linkToken })
		.from(user)
		.where(eq(user.id, id))
		.get();
	if (row?.linkToken) return row.linkToken;
	const token = newToken();
	await db.update(user).set({ linkToken: token }).where(eq(user.id, id));
	return token;
}

/** The token in this person's list-email footer, generating one if missing. */
export async function ensureUnsubscribeToken(
	db: Db,
	id: string,
): Promise<string> {
	const row = await db
		.select({ unsubscribeToken: user.unsubscribeToken })
		.from(user)
		.where(eq(user.id, id))
		.get();
	if (row?.unsubscribeToken) return row.unsubscribeToken;
	const token = newToken();
	await db.update(user).set({ unsubscribeToken: token }).where(eq(user.id, id));
	return token;
}

/** Record that a sign-in link just went out, for the request cooldown. */
export async function markLinkSent(db: Db, id: string): Promise<void> {
	await db.update(user).set({ linkSentAt: new Date() }).where(eq(user.id, id));
}

/** Who a list-email footer link belongs to. Null when the token means nothing. */
export async function findPersonByUnsubscribeToken(
	db: Db,
	token: string,
): Promise<{
	id: string;
	email: string;
	name: string;
	status: PersonStatus;
	unsubscribedAt: Date | null;
} | null> {
	const row = await db
		.select({
			id: user.id,
			email: user.email,
			name: user.name,
			status: user.status,
			unsubscribedAt: user.unsubscribedAt,
		})
		.from(user)
		.where(eq(user.unsubscribeToken, token))
		.get();
	return row ?? null;
}

/**
 * No more email. The account still works and invitations still list them;
 * the hosts see that this person will not get the mail. A repeat (the
 * webhook firing twice, the footer clicked again) keeps the first reason.
 */
export async function unsubscribe(
	db: Db,
	where: { id: string } | { email: string },
	reason: UnsubscribeReason,
): Promise<boolean> {
	const match =
		"id" in where
			? eq(user.id, where.id)
			: eq(user.email, normalizeEmail(where.email));
	const result = await db
		.update(user)
		.set({ unsubscribedAt: new Date(), unsubscribeReason: reason })
		.where(and(match, isNull(user.unsubscribedAt)))
		.run();
	return result.meta.changes === 1;
}

/**
 * Email again. Never touches a deactivated row, so no self-service path can
 * become a way around an admin. The caller also lifts Brevo's blocklist, or
 * the person reads as subscribed and is quietly undeliverable.
 */
export async function resubscribe(db: Db, userId: string): Promise<boolean> {
	const result = await db
		.update(user)
		.set({ unsubscribedAt: null, unsubscribeReason: null })
		.where(and(eq(user.id, userId), ne(user.status, "deactivated")))
		.run();
	return result.meta.changes === 1;
}

/**
 * Change what somebody may do. Written here rather than through Better
 * Auth's admin plugin, which only knows `admin` and `user` and refuses
 * `host`. The session cookie caches the old role for up to five minutes;
 * anything that grants access re-reads D1.
 */
export async function setRole(db: Db, userId: string, role: Role) {
	await db.update(user).set({ role }).where(eq(user.id, userId));
}

/**
 * Out. Admin only. `banned` is set in the same statement so Better Auth
 * refuses the password door too; the caller kills their sessions.
 */
export async function deactivate(
	db: Db,
	input: { userId: string; reason?: string | null },
): Promise<void> {
	const reason = input.reason?.trim() || null;
	await db
		.update(user)
		.set({
			status: "deactivated",
			statusChangedAt: new Date(),
			statusChangedBy: "admin",
			banned: true,
			banReason: reason,
			banExpires: null,
		})
		.where(eq(user.id, input.userId));
}

/** Undo a deactivation. Admin only, and the only thing that clears `banned`. */
export async function reactivate(db: Db, userId: string): Promise<void> {
	await db
		.update(user)
		.set({
			status: "active",
			statusChangedAt: new Date(),
			statusChangedBy: "admin",
			banned: false,
			banReason: null,
			banExpires: null,
		})
		.where(eq(user.id, userId));
}

/** Stamp the tokens onto a row that has none. Idempotent; used by the create hook. */
export async function stampTokens(db: Db, userId: string): Promise<void> {
	// One statement per token, each guarded by its own IS NULL. Filling both in
	// a single UPDATE guarded on `link_token` would hand somebody a new
	// unsubscribe token whenever only the sign-in one was missing, and break
	// the footer links already sitting in their inbox.
	await db
		.update(user)
		.set({ linkToken: newToken() })
		.where(and(eq(user.id, userId), isNull(user.linkToken)));
	await db
		.update(user)
		.set({ unsubscribeToken: newToken() })
		.where(and(eq(user.id, userId), isNull(user.unsubscribeToken)));
}

export type { PersonSource, PersonStatus, Role, StatusActor };
