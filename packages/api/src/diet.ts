import { ORPCError } from "@orpc/server";
import type { Db } from "@rsvp-site/db";
import { type DietBy, setDiets } from "@rsvp-site/db/details";
import { DIET_IDS, DIET_NOTE_MAX } from "@rsvp-site/db/diets";
import { z } from "zod";

import { idSchema } from "./inputs";

export const dietIdsInput = z.array(z.enum(DIET_IDS)).max(DIET_IDS.length);
export const dietNoteInput = z
	.string()
	.trim()
	.max(DIET_NOTE_MAX, "That's too long.");

/**
 * Diets for several people at once: the guest who just answered and the
 * relatives they answered for. Sent whole even when unchanged, since
 * saving is also how somebody confirms them.
 */
export const dietsInput = z.object({
	people: z
		.array(
			z.object({
				userId: idSchema,
				diets: dietIdsInput,
				note: dietNoteInput.default(""),
			}),
		)
		.min(1)
		.max(21),
});

/**
 * Save diets for people the caller may set them for: `allowed` is
 * themselves and their relatives (or, for an admin, anybody). One id
 * outside it fails the lot, the same "nobody" a wrong id gets.
 */
export async function saveDiets(
	db: Db,
	input: z.infer<typeof dietsInput>,
	by: DietBy,
	allowed: ReadonlySet<string> | "anyone",
): Promise<{ ok: true }> {
	const last = new Map(input.people.map((p) => [p.userId, p]));
	if (allowed !== "anyone" && [...last.keys()].some((id) => !allowed.has(id))) {
		throw new ORPCError("NOT_FOUND", { message: "Nobody by that id." });
	}
	const rows = [...last.values()].map((p) => ({
		userId: p.userId,
		diet: { diets: p.diets, note: p.note },
	}));
	const written = await setDiets(db, rows, by);
	if (written.length !== rows.length) {
		throw new ORPCError("NOT_FOUND", { message: "Nobody by that id." });
	}
	return { ok: true };
}
