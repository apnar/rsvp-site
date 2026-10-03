import { ORPCError } from "@orpc/server";
import type { Db } from "@rsvp-site/db";
import { built, rawBatch } from "@rsvp-site/db/batch";
import {
	eventGuest,
	GUEST_RESPONSES,
	potluckClaim,
} from "@rsvp-site/db/schema/event";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

import { type Access, requireOpen } from "./events";
import { clampParty } from "./headcount";
import { idSchema } from "./inputs";
import { alertHosts } from "./mail";

/** What a guest sends with an answer, whichever way they reached the page. */
export const answerInput = z.object({
	response: z.enum(GUEST_RESPONSES),
	adults: z.number().int().min(0).max(50).default(1),
	kids: z.number().int().min(0).max(50).default(0),
	dietary: z.string().trim().max(300).default(""),
	note: z.string().trim().max(1000).default(""),
	claims: z.array(idSchema).max(40).default([]),
});

/**
 * A guest's answer, with their party, notes and potluck picks, saved in
 * one go. Anything the event does not ask for is dropped rather than
 * stored. Answers stay open until the party starts: the deadline is the
 * host's request, not a lock. Signed in (guests.respond) or holding a
 * printed card (paper.respond), the rules are these.
 *
 * Potluck claims are guarded in the INSERT itself -- it only writes while
 * the item still has room -- so two guests taking the last slot at once
 * cannot both get it. A claim that lost comes back in `full`.
 */
export async function answer(
	db: Db,
	access: Access,
	who: { id: string; name: string },
	input: z.infer<typeof answerInput>,
): Promise<{ ok: true; full: string[] }> {
	const row = access.event;
	if (!access.guest) {
		throw new ORPCError("BAD_REQUEST", {
			message: "You're hosting this one, not on its list.",
		});
	}
	requireOpen(row);

	const guest = access.guest;
	const party =
		input.response === "no" ? { adults: 1, kids: 0 } : clampParty(input, row);
	// A "no" brings nothing; otherwise keep exactly what was ticked.
	const wanted = [
		...new Set(
			input.response === "no" || !row.potluckEnabled ? [] : input.claims,
		),
	];
	// What this guest already holds: a claim insert that changes nothing
	// is either "you have it" or "it's full", and only this tells them
	// apart without a read per item.
	const held = new Set(
		(
			await db
				.select({ itemId: potluckClaim.itemId })
				.from(potluckClaim)
				.where(eq(potluckClaim.guestId, guest.id))
				.all()
		).map((c) => c.itemId),
	);
	// One batch (atomic on D1): the answer, the dropped claims and each
	// guarded claim land together or not at all.
	const results = await rawBatch(db.$client, [
		built(
			db
				.update(eventGuest)
				.set({
					response: input.response,
					...party,
					dietary: row.askDietary ? input.dietary : "",
					note: row.askNote ? input.note : "",
					respondedAt: new Date(),
				})
				.where(eq(eventGuest.id, guest.id)),
		),
		built(
			db
				.delete(potluckClaim)
				.where(
					wanted.length
						? and(
								eq(potluckClaim.guestId, guest.id),
								notInArray(potluckClaim.itemId, wanted),
							)
						: eq(potluckClaim.guestId, guest.id),
				),
		),
		// Plain names, not drizzle columns: in a raw template drizzle may
		// write `"id"` unqualified, which would resolve against the wrong
		// table here (see CLAUDE.md).
		...wanted.map((itemId) =>
			built(sql`
				insert into potluck_claim (item_id, guest_id)
				select ${itemId}, ${guest.id}
				where exists (
					select 1 from potluck_item i
					where i.id = ${itemId}
						and i.event_id = ${row.id}
						and i.quantity > (
							select count(*) from potluck_claim c where c.item_id = i.id
						)
				)
				on conflict do nothing
			`),
		),
	]);
	const full = wanted.filter(
		(itemId, i) => results[i + 2]?.meta.changes !== 1 && !held.has(itemId),
	);

	const changed =
		guest.response !== input.response ||
		guest.adults !== party.adults ||
		guest.kids !== party.kids;
	if (changed) {
		await alertHosts(
			db,
			row,
			{
				name: who.name,
				response: input.response,
				adults: party.adults,
				kids: party.kids,
				note: row.askNote ? input.note : "",
			},
			who.id,
		);
	}
	return { ok: true, full };
}
