import { ORPCError } from "@orpc/server";
import type { Db } from "@rsvp-site/db";
import { built, rawBatch } from "@rsvp-site/db/batch";
import { relativesOnEvent } from "@rsvp-site/db/families";
import {
	eventGuest,
	GUEST_RESPONSES,
	potluckClaim,
} from "@rsvp-site/db/schema/event";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

import { type Access, requireOpen } from "./events";
import { clampParty, relativeParty } from "./headcount";
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
	/** Answers for relatives on the same list (see `relativesOnEvent`). */
	family: z
		.array(z.object({ guestId: idSchema, response: z.enum(GUEST_RESPONSES) }))
		.max(20)
		.default([]),
});

/**
 * A guest's answer, with their party, notes and potluck picks, saved in
 * one go. Anything the event does not ask for is dropped rather than
 * stored. Answers stay open until the party starts: the deadline is the
 * host's request, not a lock. Signed in (guests.respond) or holding a
 * printed card (paper.respond), the rules are these.
 *
 * A guest may also answer for relatives on the same list (`input.family`).
 * Those answers are written in the same batch, stamped with who gave them
 * (`answered_by`), and only for people `relativesOnEvent` says are theirs:
 * any other id is ignored. A relative's party is fixed by `relativeParty`,
 * not by what the request says. The hosts get one alert for the lot.
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
	const [heldRows, relatives] = await Promise.all([
		db
			.select({ itemId: potluckClaim.itemId })
			.from(potluckClaim)
			.where(eq(potluckClaim.guestId, guest.id))
			.all(),
		input.family.length
			? relativesOnEvent(db, row.id, guest.userId)
			: Promise.resolve([]),
	]);
	const held = new Set(heldRows.map((c) => c.itemId));
	// Last entry per id wins; an id that is not a relative is dropped
	// silently, and one that would change nothing is not rewritten (or
	// announced to the hosts).
	const asked = new Map(input.family.map((f) => [f.guestId, f.response]));
	const kept = relatives.flatMap((rel) => {
		const response = asked.get(rel.id);
		if (!response) return [];
		const theirs = relativeParty(rel.child, row.askKids);
		const same =
			rel.response === response &&
			rel.adults === theirs.adults &&
			rel.kids === theirs.kids;
		return same ? [] : [{ rel, response, party: theirs }];
	});
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
					answeredBy: null,
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
		// After the claims: `results[i + 2]` below indexes only those.
		...kept.flatMap(({ rel, response, party: theirs }) => [
			built(
				db
					.update(eventGuest)
					.set({
						response,
						...theirs,
						respondedAt: new Date(),
						answeredBy: who.id,
					})
					.where(
						and(eq(eventGuest.id, rel.id), eq(eventGuest.eventId, row.id)),
					),
			),
			...(response === "no"
				? [
						built(
							db.delete(potluckClaim).where(eq(potluckClaim.guestId, rel.id)),
						),
					]
				: []),
		]),
	]);
	const full = wanted.filter(
		(itemId, i) => results[i + 2]?.meta.changes !== 1 && !held.has(itemId),
	);

	const changed =
		guest.response !== input.response ||
		guest.adults !== party.adults ||
		guest.kids !== party.kids;
	if (changed || kept.length > 0) {
		await alertHosts(
			db,
			row,
			{
				name: who.name,
				response: input.response,
				adults: party.adults,
				kids: party.kids,
				note: row.askNote ? input.note : "",
				self: changed,
				for: kept.map((k) => ({
					name: k.rel.name,
					response: k.response,
					...k.party,
				})),
			},
			who.id,
		);
	}
	return { ok: true, full };
}
