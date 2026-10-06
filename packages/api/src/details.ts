import { ORPCError } from "@orpc/server";
import type { Db } from "@rsvp-site/db";
import {
	changeEmail,
	type Details,
	updateDetails,
} from "@rsvp-site/db/details";
import { NAME_MAX } from "@rsvp-site/db/names";
import { normalizePhone } from "@rsvp-site/db/phone";
import { isAdmin } from "@rsvp-site/db/roles";
import { z } from "zod";

import { dietIdsInput, dietNoteInput } from "./diet";

const part = (max: number) => z.string().trim().max(max, "That's too long.");

/**
 * Any of a person's details, each on its own: the contacts page saves one
 * field at a time. A blank phone clears it; anything else must be a number.
 */
export const detailsPatch = z.object({
	firstName: part(NAME_MAX).optional(),
	lastName: part(NAME_MAX).optional(),
	phone: z
		.string()
		.max(40)
		.transform((raw, ctx) => {
			if (!raw.trim()) return null;
			const phone = normalizePhone(raw);
			if (!phone) {
				ctx.addIssue({
					code: "custom",
					message: "That doesn't look like a phone number.",
				});
				return z.NEVER;
			}
			return phone;
		})
		.optional(),
	addressLine1: part(100).optional(),
	addressLine2: part(100).optional(),
	city: part(60).optional(),
	region: part(60).optional(),
	postalCode: part(20).optional(),
	country: part(60).optional(),
	diets: dietIdsInput.optional(),
	dietNote: dietNoteInput.optional(),
});

/** Nobody is a blank: a name pair needs at least a first name. */
function checkName(patch: Partial<Details>) {
	if (patch.firstName !== undefined && !patch.firstName) {
		throw new ORPCError("BAD_REQUEST", { message: "A first name, at least." });
	}
}

export const CLAIMED =
	"They've signed in, so their details are theirs to change.";

/** `canEditReach`'s refusal, for a host who didn't type them in. */
export const NOT_YOURS =
	"Only they, an admin or the host who first added them can change their email or phone.";

/**
 * Who a write is checked against: the host's id, or null for an admin (and
 * for anybody writing their own record, who passes null directly).
 */
export function hostOf(me: { id: string; role: string | null }): string | null {
	return isAdmin(me) ? null : me.id;
}

/** Write a patch, telling a host who lost the race why it didn't land. */
export async function saveDetails(
	db: Db,
	userId: string,
	patch: Partial<Details>,
	host: string | null,
): Promise<void> {
	checkName(patch);
	if (Object.keys(patch).length === 0) return;
	const ok = await updateDetails(db, userId, patch, { host });
	if (!ok) {
		throw new ORPCError("BAD_REQUEST", {
			message: host ? CLAIMED : "Nobody by that id.",
		});
	}
}

/**
 * Change an address in place. "taken" goes back to the caller, which
 * decides: a host re-points their address book entry, an admin is told.
 */
export async function saveEmail(
	db: Db,
	userId: string,
	email: string,
	host: string | null,
): Promise<"ok" | "same" | "taken"> {
	const outcome = await changeEmail(db, userId, email, { host });
	if (outcome === "refused") {
		throw new ORPCError("BAD_REQUEST", {
			message: host ? NOT_YOURS : "Nobody by that id.",
		});
	}
	return outcome;
}
