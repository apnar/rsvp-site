import { and, eq, isNull, or, type SQL, sql } from "drizzle-orm";

import { normalizeEmail } from "./addresses";
import { batchAll } from "./batch";
import { isUniqueViolation } from "./errors";
import type { Db } from "./index";
import { nameFor } from "./names";
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
};

export const ADDRESS_FIELDS = [
	"addressLine1",
	"addressLine2",
	"city",
	"region",
	"postalCode",
	"country",
] as const;

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
 * Where an edit may land. A host's write carries the same conditions as
 * `canEditDetails` into the UPDATE, so somebody signing in between the
 * check and the write keeps their record.
 */
function editable(id: string, asHost: boolean): SQL | undefined {
	return asHost
		? and(
				eq(user.id, id),
				isNull(user.claimedAt),
				eq(user.status, "active"),
				// Null is a plain guest too: see `roleOf`.
				or(isNull(user.role), eq(user.role, "user")),
				// Plain names: a raw subquery on a single-table update (CLAUDE.md).
				sql`not exists (select 1 from family_member where family_member.user_id = ${id})`,
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
	opts: { asHost: boolean },
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
	const result = await db
		.update(user)
		.set({
			...patch,
			...(newNumber ? { textsOkAt: null, textsOkBy: null } : {}),
			...(named
				? {
						firstName,
						lastName,
						// A name-only guest's placeholder address is never a name.
						name: nameFor(firstName, lastName, row.noEmail ? "" : row.email),
					}
				: {}),
		})
		.where(editable(id, opts.asHost))
		.run();
	return result.meta.changes === 1;
}

/**
 * Fill in what a host typed for people who already exist, without
 * overwriting: a name only where nobody has given one, a phone only where
 * there is none. A pasted "Linh N" never replaces "Linh Nguyen"; changing
 * a name is an edit, made on purpose. Claimed records are never touched.
 */
export async function fillBlanks(
	db: Db,
	people: readonly {
		id: string;
		email: string;
		typed: { firstName?: string; lastName?: string; phone?: string | null };
	}[],
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
							eq(user.id, id),
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
						and(eq(user.id, id), isNull(user.claimedAt), isNull(user.phone)),
					),
			);
		}
		return out;
	});
	await batchAll(db, statements);
}

/**
 * Change somebody's address in place: a typo fixed, or a name-only guest
 * given one. Whatever was sent to the old address went to somebody else,
 * so both tokens are replaced (its links stop working) and an unsubscribe
 * from there no longer speaks for this person. "taken" when the address is
 * already somebody's: merging two people is never guessed at.
 */
export async function changeEmail(
	db: Db,
	id: string,
	raw: string,
	opts: { asHost: boolean },
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
		})
		.from(user)
		.where(eq(user.id, id))
		.get();
	if (!row) return "refused";
	try {
		const result = await db
			.update(user)
			.set({
				email,
				noEmail: false,
				emailVerified: false,
				name: nameFor(row.firstName, row.lastName, email),
				linkToken: newToken(),
				unsubscribeToken: newToken(),
				unsubscribedAt: null,
				unsubscribeReason: null,
			})
			.where(editable(id, opts.asHost))
			.run();
		return result.meta.changes === 1 ? "ok" : "refused";
	} catch (error) {
		// Somebody took the address between the check and the write.
		if (isUniqueViolation(error)) return "taken";
		throw error;
	}
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
