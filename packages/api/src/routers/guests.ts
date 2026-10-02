import { ORPCError } from "@orpc/server";
import { findOrCreatePeople, parseAddresses } from "@rsvp-site/db/people";
import { contactGroup, contactGroupMember } from "@rsvp-site/db/schema/contact";
import {
	eventGuest,
	GUEST_RESPONSES,
	potluckClaim,
} from "@rsvp-site/db/schema/event";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

import { accessTo, guestsOf, hostAccessTo, potluckOf } from "../events";
import { clampParty, headcount, tally } from "../headcount";
import { hostProcedure, personProcedure } from "../index";
import { alertHosts } from "../mail";
import { startsAt } from "../schedule";

const idInput = z.object({ eventId: z.string().min(1) });

export const guestsRouter = {
	/** The host's guest list: every row, the totals, and the potluck. */
	list: hostProcedure.input(idInput).handler(async ({ context, input }) => {
		const { event: row } = await hostAccessTo(
			context.db,
			context.me,
			input.eventId,
		);
		const [guests, potluck] = await Promise.all([
			guestsOf(context.db, row.id),
			potluckOf(context.db, row.id),
		]);
		const labels = new Map(potluck.lines.map((l) => [l.id, l.label]));
		const totals = tally(guests);
		return {
			now: new Date().toISOString(),
			event: {
				id: row.id,
				title: row.title,
				status: row.status,
				date: row.date,
				rsvpDeadline: row.rsvpDeadline,
				potluckEnabled: row.potluckEnabled,
			},
			totals,
			headcount: headcount(totals),
			potluck: potluck.lines,
			guests: guests.map((g) => ({
				...g,
				bringing: potluck.claims
					.filter((c) => c.guestId === g.id)
					.map((c) => labels.get(c.itemId) ?? ""),
			})),
		};
	}),

	/**
	 * Put people on the list: pasted addresses, whole contact groups, or
	 * both. New addresses become accounts. Nobody is emailed here -- the
	 * host sends when ready, and the page says how many are waiting.
	 */
	add: hostProcedure
		.input(
			idInput.extend({
				emails: z.string().max(20_000).default(""),
				groupIds: z.array(z.string().min(1)).max(50).default([]),
			}),
		)
		.handler(async ({ context, input }) => {
			const { event: row } = await hostAccessTo(
				context.db,
				context.me,
				input.eventId,
			);
			if (row.status === "canceled") {
				throw new ORPCError("BAD_REQUEST", { message: "It's canceled." });
			}
			const typed = parseAddresses(input.emails);
			if (typed.length > 500) {
				throw new ORPCError("BAD_REQUEST", {
					message: "That's a lot of people. Add them 500 at a time.",
				});
			}
			const people = await findOrCreatePeople(context.db, typed, "host");

			// Groups only count if they are the caller's own -- or anybody's, for
			// an admin -- so a guessed group id reveals and adds nothing.
			let members: { userId: string }[] = [];
			if (input.groupIds.length > 0) {
				members = await context.db
					.select({ userId: contactGroupMember.userId })
					.from(contactGroupMember)
					.innerJoin(
						contactGroup,
						eq(contactGroup.id, contactGroupMember.groupId),
					)
					.where(
						and(
							inArray(contactGroupMember.groupId, input.groupIds),
							context.me.role === "admin"
								? undefined
								: eq(contactGroup.ownerId, context.me.id),
						),
					)
					.all();
			}

			const usable = people.filter((p) => p.status !== "deactivated");
			const rows = [
				...usable.map((p) => ({ userId: p.id, source: "host" as const })),
				...members.map((m) => ({ userId: m.userId, source: "group" as const })),
			];
			const unique = [...new Map(rows.map((r) => [r.userId, r])).values()];
			let added = 0;
			for (let i = 0; i < unique.length; i += 10) {
				const inserted = await context.db
					.insert(eventGuest)
					.values(
						unique.slice(i, i + 10).map((r) => ({
							id: crypto.randomUUID(),
							eventId: row.id,
							userId: r.userId,
							source: r.source,
							addedBy: context.me.id,
						})),
					)
					.onConflictDoNothing()
					.returning({ id: eventGuest.id })
					.all();
				added += inserted.length;
			}
			return {
				added,
				already: unique.length - added,
				created: people.filter((p) => p.created).length,
				refused: people.length - usable.length,
				invalid: input.emails.trim() && typed.length === 0,
			};
		}),

	/** Take somebody off the list, and with them their answer and their claims. */
	remove: hostProcedure
		.input(idInput.extend({ guestId: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const { event: row } = await hostAccessTo(
				context.db,
				context.me,
				input.eventId,
			);
			await context.db
				.delete(eventGuest)
				.where(
					and(eq(eventGuest.id, input.guestId), eq(eventGuest.eventId, row.id)),
				);
			return { ok: true };
		}),

	/**
	 * A guest's answer, with their party, notes and potluck picks, saved in
	 * one go. Anything the event does not ask for is dropped rather than
	 * stored. Answers stay open until the party starts: the deadline is the
	 * host's request, not a lock.
	 *
	 * Potluck claims are guarded in the INSERT itself -- it only writes while
	 * the item still has room -- so two guests taking the last slot at once
	 * cannot both get it. A claim that lost comes back in `full`.
	 */
	respond: personProcedure
		.input(
			idInput.extend({
				response: z.enum(GUEST_RESPONSES),
				adults: z.number().int().min(0).max(50).default(1),
				kids: z.number().int().min(0).max(50).default(0),
				dietary: z.string().trim().max(300).default(""),
				note: z.string().trim().max(1000).default(""),
				claims: z.array(z.string().min(1)).max(40).default([]),
			}),
		)
		.handler(async ({ context, input }) => {
			const access = await accessTo(context.db, context.me, input.eventId);
			const row = access.event;
			if (!access.guest) {
				throw new ORPCError("BAD_REQUEST", {
					message: "You're hosting this one, not on its list.",
				});
			}
			if (row.status !== "published") {
				throw new ORPCError("BAD_REQUEST", {
					message:
						row.status === "canceled"
							? "It's been canceled."
							: "It hasn't gone out yet.",
				});
			}
			const start = startsAt(row);
			if (start && Date.now() >= start.getTime()) {
				throw new ORPCError("BAD_REQUEST", {
					message: "It's already started. Tell the hosts directly.",
				});
			}

			const guest = access.guest;
			const party =
				input.response === "no"
					? { adults: 1, kids: 0 }
					: clampParty(input, row);
			await context.db
				.update(eventGuest)
				.set({
					response: input.response,
					...party,
					dietary: row.askDietary ? input.dietary : "",
					note: row.askNote ? input.note : "",
					respondedAt: new Date(),
				})
				.where(eq(eventGuest.id, guest.id));

			// A "no" brings nothing; otherwise keep exactly what was ticked.
			const wanted =
				input.response === "no" || !row.potluckEnabled ? [] : input.claims;
			await context.db
				.delete(potluckClaim)
				.where(
					wanted.length
						? and(
								eq(potluckClaim.guestId, guest.id),
								notInArray(potluckClaim.itemId, wanted),
							)
						: eq(potluckClaim.guestId, guest.id),
				);
			const full: string[] = [];
			for (const itemId of wanted) {
				// Plain names, not drizzle columns: in a raw template drizzle may
				// write `"id"` unqualified, which would resolve against the wrong
				// table here (see CLAUDE.md).
				const result = await context.db.run(sql`
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
				`);
				if (result.meta.changes !== 1) {
					const already = await context.db
						.select({ itemId: potluckClaim.itemId })
						.from(potluckClaim)
						.where(
							and(
								eq(potluckClaim.guestId, guest.id),
								eq(potluckClaim.itemId, itemId),
							),
						)
						.get();
					if (!already) full.push(itemId);
				}
			}

			const changed =
				guest.response !== input.response ||
				guest.adults !== party.adults ||
				guest.kids !== party.kids;
			if (changed) {
				await alertHosts(
					context.db,
					row,
					{
						name: context.me.name,
						response: input.response,
						adults: party.adults,
						kids: party.kids,
						note: row.askNote ? input.note : "",
					},
					context.me.id,
				);
			}
			return { ok: true, full };
		}),
};
