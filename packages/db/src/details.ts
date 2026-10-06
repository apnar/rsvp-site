import { and, eq, isNull, or, type SQL, sql } from "drizzle-orm";

import { normalizeEmail } from "./addresses";
import { batchAll } from "./batch";
import type { Diet, DietId } from "./diets";
import { isUniqueViolation } from "./errors";
import type { Db } from "./index";
import { nameFor } from "./names";
import { shownEmail, stillIn } from "./reach";
import { isAdmin, roleOf } from "./roles";
import { user } from "./schema/auth";
import { newToken } from "./tokens";

/** Everything about a person that a host may fill in before they sign in. */
export type Details = {
	firstName: string;
	lastName: string;
	phone: string | null;
	addressLine1: string;
	addressLine2: string;
	city: string;
	region: string;
	postalCode: string;
	country: string;
	diets: DietId[];
	dietNote: string;
};

/** The columns behind `Details`, for selects. */
export const detailColumns = {
	firstName: user.firstName,
	lastName: user.lastName,
	phone: user.phone,
	addressLine1: user.addressLine1,
	addressLine2: user.addressLine2,
	city: user.city,
	region: user.region,
	postalCode: user.postalCode,
	country: user.country,
};

/**
 * The columns behind a person's diet, for selects. `diets` comes back raw:
 * pass it through `dietsOf`.
 */
export const dietColumns = {
	diets: user.diets,
	dietNote: user.dietNote,
	dietAt: user.dietAt,
};

/**
 * Whether the caller may change somebody's details. Signing in claims the
 * record: from then on it is theirs, and only they and an admin change it.
 * Before that, a host who has them in their address book may -- the host
 * typed most of it in the first place -- but only for a plain guest who is
 * still in. An unclaimed host's or admin's address is a way to their role,
 * so no other host gets to move it. Nor does a host edit anybody in a
 * family: families are shared across hosts and kept by admins, and a
 * name-only child never signs in to take their record back.
 */
export function canEditDetails(
	me: { id: string; role: string | null },
	target: {
		id: string;
		role: string | null;
		status: string;
		claimedAt: Date | null;
		inFamily: boolean;
	},
	inMyBook: boolean,
): boolean {
	if (isAdmin(me) || me.id === target.id) return true;
	return (
		inMyBook &&
		!target.inFamily &&
		target.claimedAt === null &&
		target.status !== "deactivated" &&
		roleOf(target.role) === "user"
	);
}

/**
 * Whether the caller may change somebody's address or number. Those are
 * where sign-in links go ("email me my link", "text me my link"), so a
 * host needs more than `canEditDetails`: being the one who typed the
 * person in. Being in a host's book is not enough, since any host can put
 * anybody in theirs by typing an address they know.
 */
export function canEditReach(
	me: { id: string; role: string | null },
	target: Parameters<typeof canEditDetails>[1] & { createdBy: string | null },
	inMyBook: boolean,
): boolean {
	if (isAdmin(me) || me.id === target.id) return true;
	return canEditDetails(me, target, inMyBook) && target.createdBy === me.id;
}

/**
 * Where an edit may land. A host's write (`host` is their id; null is an
 * admin or the person themselves) carries the conditions of
 * `canEditDetails` into the UPDATE, and those of `canEditReach` when it
 * touches an address or number, so somebody signing in between the check
 * and the write keeps their record.
 */
function editable(
	id: string,
	host: string | null,
	reach: boolean,
): SQL | undefined {
	return host !== null
		? and(
				eq(user.id, id),
				isNull(user.claimedAt),
				eq(user.status, "active"),
				// Null is a plain guest too: see `roleOf`.
				or(isNull(user.role), eq(user.role, "user")),
				// Plain names: a raw subquery on a single-table update (CLAUDE.md).
				sql`not exists (select 1 from family_member where family_member.user_id = ${id})`,
				reach ? eq(user.createdBy, host) : undefined,
			)
		: eq(user.id, id);
}

/**
 * Change any of somebody's details. The name pair is written with `name`
 * beside it, which is what everything else reads. False when nothing
 * changed: no such person, or (for a host) they signed in meanwhile.
 */
export async function updateDetails(
	db: Db,
	id: string,
	patch: Partial<Details>,
	opts: { host: string | null },
): Promise<boolean> {
	const row = await db
		.select({
			email: user.email,
			noEmail: user.noEmail,
			firstName: user.firstName,
			lastName: user.lastName,
			phone: user.phone,
			textsOkBy: user.textsOkBy,
		})
		.from(user)
		.where(eq(user.id, id))
		.get();
	if (!row) return false;
	// A host's word that somebody expects texts was about the number the
	// host typed. A new number needs its own; the person's own switch,
	// being about them rather than a number, stays.
	const newNumber =
		patch.phone !== undefined &&
		patch.phone !== row.phone &&
		row.textsOkBy !== id;
	const firstName = patch.firstName ?? row.firstName;
	const lastName = patch.lastName ?? row.lastName;
	const named = patch.firstName !== undefined || patch.lastName !== undefined;
	const dieted = patch.diets !== undefined || patch.dietNote !== undefined;
	const result = await db
		.update(user)
		.set({
			...patch,
			...(newNumber ? { textsOkAt: null, textsOkBy: null } : {}),
			...(dieted ? { dietAt: new Date() } : {}),
			...(named
				? {
						firstName,
						lastName,
						// A name-only guest's placeholder address is never a name.
						name: nameFor(firstName, lastName, shownEmail(row)),
					}
				: {}),
		})
		.where(editable(id, opts.host, patch.phone !== undefined))
		.run();
	return result.meta.changes === 1;
}

/**
 * Who is setting diets outside the details forms. A person sets their own
 * and their relatives': diets are the one thing family members may change
 * for each other, since a parent answering for a child is the only one who
 * will. A printed card counts as its guest, for the same people it may
 * answer for -- a diet is no way into an account, unlike an address.
 */
export type DietBy = { admin: true } | { admin: false; userId: string };

/** Where a diet may land for this writer; repeated in the UPDATE against races. */
function dietWritable(id: string, by: DietBy): SQL | undefined {
	if (by.admin) return eq(user.id, id);
	if (by.userId === id) {
		return and(eq(user.id, id), stillIn());
	}
	return and(
		eq(user.id, id),
		stillIn(),
		// Plain names: a raw subquery on a single-table update (CLAUDE.md).
		sql`exists (
			select 1 from family_member mine
			join family_member kin on kin.family_id = mine.family_id
			where mine.user_id = ${by.userId} and kin.user_id = ${id}
		)`,
	);
}

/**
 * Save (or confirm, unchanged) diets for these people, stamping `diet_at`
 * either way: a confirmation is what turns the next ask into "still
 * right?". The ids returned are the ones written; the caller checked who
 * they may set beforehand, and anybody missing lost a race.
 */
export async function setDiets(
	db: Db,
	rows: readonly { userId: string; diet: Diet }[],
	by: DietBy,
): Promise<string[]> {
	if (rows.length === 0) return [];
	const at = new Date();
	const results = await batchAll(
		db,
		rows.map(({ userId, diet }) =>
			db
				.update(user)
				.set({ diets: diet.diets, dietNote: diet.note, dietAt: at })
				.where(dietWritable(userId, by)),
		),
	);
	return rows
		.filter((_, i) => results[i]?.meta.changes === 1)
		.map((r) => r.userId);
}

/**
 * Fill in what a host typed for people who already exist, without
 * overwriting: a name only where nobody has given one, a phone only where
 * there is none. A pasted "Linh N" never replaces "Linh Nguyen"; changing
 * a name is an edit, made on purpose. Claimed records are never touched,
 * and a host fills only what they could edit (`editable`): typing a known
 * address beside your own number must not put your number on somebody
 * else's record, where "text me my link" would send their way in.
 */
export async function fillBlanks(
	db: Db,
	people: readonly {
		id: string;
		email: string;
		typed: { firstName?: string; lastName?: string; phone?: string | null };
	}[],
	host: string | null,
): Promise<void> {
	const statements = people.flatMap(({ id, email, typed }) => {
		const out = [];
		if (typed.firstName) {
			const lastName = typed.lastName ?? "";
			out.push(
				db
					.update(user)
					.set({
						firstName: typed.firstName,
						lastName,
						name: nameFor(typed.firstName, lastName, email),
					})
					.where(
						and(
							editable(id, host, false),
							isNull(user.claimedAt),
							eq(user.firstName, ""),
						),
					),
			);
		}
		if (typed.phone) {
			out.push(
				db
					.update(user)
					.set({ phone: typed.phone })
					.where(
						and(
							editable(id, host, true),
							isNull(user.claimedAt),
							isNull(user.phone),
						),
					),
			);
		}
		return out;
	});
	await batchAll(db, statements);
}

/**
 * The one way an address is written. Checks it is free (merging two people
 * is never guessed at), writes it with the name that depends on it, and
 * turns a write that lost the race for the address into "taken". A
 * name-only record given its first address keeps getting texts beside the
 * email, if it was, rather than finding its invitations moved.
 */
async function writeEmail(
	db: Db,
	id: string,
	raw: string,
	write: {
		where: SQL | undefined;
		set: (row: { noEmail: boolean }) => Partial<typeof user.$inferInsert>;
	},
): Promise<"ok" | "same" | "taken" | "refused"> {
	const email = normalizeEmail(raw);
	const owner = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, email))
		.get();
	if (owner) return owner.id === id ? "same" : "taken";
	const row = await db
		.select({
			firstName: user.firstName,
			lastName: user.lastName,
			noEmail: user.noEmail,
			contactBy: user.contactBy,
			textsOkAt: user.textsOkAt,
			textsOffAt: user.textsOffAt,
		})
		.from(user)
		.where(eq(user.id, id))
		.get();
	if (!row) return "refused";
	const texted = row.textsOkAt !== null && row.textsOffAt === null;
	try {
		const result = await db
			.update(user)
			.set({
				email,
				noEmail: false,
				name: nameFor(row.firstName, row.lastName, email),
				...(row.noEmail && texted && row.contactBy === null
					? { contactBy: "both" as const }
					: {}),
				...write.set(row),
			})
			.where(write.where)
			.run();
		return result.meta.changes === 1 ? "ok" : "refused";
	} catch (error) {
		// Somebody took the address between the check and the write.
		if (isUniqueViolation(error)) return "taken";
		throw error;
	}
}

/**
 * Change somebody's address in place: a typo fixed, or a name-only guest
 * given one. Whatever was sent to an old real address went to somebody
 * else, so then both tokens are replaced (its links stop working) and an
 * unsubscribe from there no longer speaks for this person. A placeholder
 * was never sent anything, and the links texted to this person copy the
 * current token, so a name-only record keeps its tokens.
 */
export async function changeEmail(
	db: Db,
	id: string,
	raw: string,
	opts: { host: string | null },
): Promise<"ok" | "same" | "taken" | "refused"> {
	return writeEmail(db, id, raw, {
		where: editable(id, opts.host, true),
		set: (row) => ({
			emailVerified: false,
			...(row.noEmail
				? {}
				: {
						linkToken: newToken(),
						unsubscribeToken: newToken(),
						unsubscribedAt: null,
						unsubscribeReason: null,
					}),
		}),
	});
}

/**
 * Stamp the first sign-in. Called from the session hook, so every way in
 * counts; only the first one is kept.
 */
export async function markClaimed(db: Db, id: string): Promise<void> {
	await db
		.update(user)
		.set({ claimedAt: new Date() })
		.where(and(eq(user.id, id), isNull(user.claimedAt)));
}

/** What somebody answering could still give us: an address, a number. */
type ContactGaps = { email: boolean; phone: boolean };

export const NO_GAPS: ContactGaps = { email: false, phone: false };

/**
 * Who is filling in the blanks. A signed-in guest fills their own record.
 * A printed card's holder is taken to be its guest, but the key is one the
 * host printed, so a card fills only what that host could: blanks on a
 * plain record nobody has signed in to, which that host typed in. `card`
 * is that host's id; null (the host is gone) fills nothing.
 */
export type FilledBy = "self" | { card: string | null };

export function gapsOf(row: {
	noEmail: boolean;
	phone: string | null;
}): ContactGaps {
	return { email: row.noEmail, phone: row.phone === null };
}

/** Where a blank may be filled. Never a deactivated row, like every self-service write. */
function fillable(id: string, by: FilledBy): SQL | undefined {
	if (by !== "self" && by.card === null) return sql`0`;
	return and(editable(id, by === "self" ? null : by.card, true), stillIn());
}

/** The blanks this caller may fill on somebody's record; none if they may fill nothing. */
export async function contactGaps(
	db: Db,
	id: string,
	by: FilledBy,
): Promise<ContactGaps> {
	const row = await db
		.select({ noEmail: user.noEmail, phone: user.phone })
		.from(user)
		.where(fillable(id, by))
		.get();
	return row ? gapsOf(row) : NO_GAPS;
}

/**
 * Give somebody with no number one. A host's word that they expect texts
 * was about whatever number there was, if any, so it goes, as it does in
 * `updateDetails`; their own switch stays. False when there was a number
 * already, or the record is no longer this caller's to fill.
 */
export async function fillPhone(
	db: Db,
	id: string,
	phone: string,
	by: FilledBy,
): Promise<boolean> {
	const row = await db
		.select({ textsOkBy: user.textsOkBy })
		.from(user)
		.where(eq(user.id, id))
		.get();
	if (!row) return false;
	const result = await db
		.update(user)
		.set({
			phone,
			...(row.textsOkBy !== id ? { textsOkAt: null, textsOkBy: null } : {}),
		})
		.where(and(fillable(id, by), isNull(user.phone)))
		.run();
	return result.meta.changes === 1;
}

/**
 * Give a name-only record the address its owner confirmed, by pressing
 * the button behind a link sent there. The tokens stay (`changeEmail`
 * says why), and the address is verified, having been clicked. "taken"
 * when the address is somebody else's: merging is never guessed at.
 */
export async function claimEmail(
	db: Db,
	id: string,
	raw: string,
	by: FilledBy,
): Promise<"ok" | "taken" | "refused"> {
	const outcome = await writeEmail(db, id, raw, {
		where: and(fillable(id, by), eq(user.noEmail, true)),
		set: () => ({ emailVerified: true }),
	});
	// A second press of the same button.
	return outcome === "same" ? "ok" : outcome;
}
