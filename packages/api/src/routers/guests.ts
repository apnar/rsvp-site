import { ORPCError } from "@orpc/server";
import { inBook, remember } from "@rsvp-site/db/address-book";
import {
	createNameOnlyPeople,
	findOrCreatePeople,
	newToken,
	parseAddresses,
	parseGuestLines,
	setRealEmail,
} from "@rsvp-site/db/people";
import { contactGroup, contactGroupMember } from "@rsvp-site/db/schema/contact";
import {
	eventGuest,
	GUEST_RESPONSES,
	potluckClaim,
} from "@rsvp-site/db/schema/event";
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

import {
	type Access,
	accessTo,
	emailsHeld,
	guestsOf,
	hostAccessTo,
	potluckOf,
} from "../events";
import { canInviteOthers } from "../guest-invites";
import { clampParty, headcount, tally } from "../headcount";
import { hostProcedure, personProcedure } from "../index";
import { alertHosts, sendInvites } from "../mail";
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
				paper: row.paper,
				emailsReleasedAt: row.emailsReleasedAt,
				emailsHeld: emailsHeld(row),
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
	 * Put people on the list: pasted addresses, picks from the address book,
	 * whole contact groups, or any mix. New addresses become accounts, and
	 * everybody the host adds goes into their address book. Nobody is
	 * emailed here -- the host sends when ready.
	 */
	add: hostProcedure
		.input(
			idInput.extend({
				emails: z.string().max(20_000).default(""),
				groupIds: z.array(z.string().min(1)).max(50).default([]),
				/** People from the caller's address book. Anybody else is ignored. */
				userIds: z.array(z.string().min(1)).max(1000).default([]),
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
			// A paper event may also take bare names, one per line: people
			// with no address who will only ever have the card.
			const lines = row.paper
				? parseGuestLines(input.emails)
				: { addresses: parseAddresses(input.emails), names: [] };
			const typed = lines.addresses;
			if (typed.length + lines.names.length > 500) {
				throw new ORPCError("BAD_REQUEST", {
					message: "That's a lot of people. Add them 500 at a time.",
				});
			}
			const people = await findOrCreatePeople(context.db, typed, "host");
			const named = await createNameOnlyPeople(context.db, lines.names, "host");

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

			// Picks only count from the caller's own book, so a guessed user id
			// adds nobody.
			const picked = await inBook(context.db, context.me.id, input.userIds);

			const usable = people.filter((p) => p.status !== "deactivated");
			const rows = [
				...usable.map((p) => ({ userId: p.id, source: "host" as const })),
				...[...picked].map((userId) => ({
					userId,
					source: "host" as const,
				})),
				...named.map((p) => ({ userId: p.id, source: "host" as const })),
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
			// Whoever the host chose is in their book from now on.
			await remember(
				context.db,
				context.me.id,
				unique.map((r) => r.userId),
			);
			return {
				added,
				already: unique.length - added,
				created: people.filter((p) => p.created).length + named.length,
				refused: people.length - usable.length,
				invalid:
					Boolean(input.emails.trim()) &&
					typed.length === 0 &&
					named.length === 0,
			};
		}),

	/**
	 * A host recording an answer for a guest -- "Dana called, they're coming
	 * with two" -- or putting one back to no reply. Not held to the event's
	 * plus-one limit: the host is the one who set it. No host alert, and
	 * potluck claims are left alone (a "no" drops them, as it would for the
	 * guest).
	 */
	setAnswer: hostProcedure
		.input(
			idInput.extend({
				guestId: z.string().min(1),
				response: z.enum(GUEST_RESPONSES).nullable(),
				adults: z.number().int().min(1).max(50),
				kids: z.number().int().min(0).max(50),
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
			const result = await context.db
				.update(eventGuest)
				.set({
					response: input.response,
					adults: input.response === "no" ? 1 : input.adults,
					kids: input.response === "no" ? 0 : input.kids,
					respondedAt: input.response ? new Date() : null,
				})
				.where(
					and(eq(eventGuest.id, input.guestId), eq(eventGuest.eventId, row.id)),
				)
				.run();
			if (result.meta.changes !== 1) {
				throw new ORPCError("NOT_FOUND", { message: "No such guest." });
			}
			if (input.response === "no") {
				await context.db
					.delete(potluckClaim)
					.where(eq(potluckClaim.guestId, input.guestId));
			}
			return { ok: true };
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

	/**
	 * Replace one guest's QR key: a lost or misprinted card stops working,
	 * and the next download prints the new one.
	 */
	newPaperCode: hostProcedure
		.input(idInput.extend({ guestId: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const { event: row } = await hostAccessTo(
				context.db,
				context.me,
				input.eventId,
			);
			if (!row.paper) {
				throw new ORPCError("BAD_REQUEST", { message: "Not a paper event." });
			}
			await context.db
				.update(eventGuest)
				.set({ paperToken: newToken() })
				.where(
					and(eq(eventGuest.id, input.guestId), eq(eventGuest.eventId, row.id)),
				);
			return { ok: true };
		}),

	/**
	 * Give a name-only guest an email address, so they can get email once
	 * it starts. An address somebody already has is refused rather than
	 * merged: the host removes this guest and invites that person instead.
	 */
	setEmail: hostProcedure
		.input(
			idInput.extend({
				guestId: z.string().min(1),
				email: z.email("That doesn't look like an email address.").max(254),
			}),
		)
		.handler(async ({ context, input }) => {
			const { event: row } = await hostAccessTo(
				context.db,
				context.me,
				input.eventId,
			);
			const guest = await context.db
				.select({ userId: eventGuest.userId })
				.from(eventGuest)
				.where(
					and(eq(eventGuest.id, input.guestId), eq(eventGuest.eventId, row.id)),
				)
				.get();
			if (!guest)
				throw new ORPCError("NOT_FOUND", { message: "No such guest." });
			const outcome = await setRealEmail(context.db, guest.userId, input.email);
			if (outcome === "taken") {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"Somebody already has that address. Remove this guest and invite them by email instead.",
				});
			}
			if (outcome === "not-placeholder") {
				throw new ORPCError("BAD_REQUEST", {
					message: "They already have an email address.",
				});
			}
			return { ok: true };
		}),

	/**
	 * A guest the host chose brings a friend: the friend goes on the list,
	 * marked as theirs, and gets the invitation now. Nobody the friend knows
	 * can follow -- people a guest adds, and people from the share link, are
	 * never offered this (see `guest-invites.ts`).
	 *
	 * The per-guest cap is checked inside the INSERT, so two quick invites
	 * cannot both slip under it; a refused insert is then told apart from a
	 * friend who was already on the list.
	 */
	inviteFriend: personProcedure
		.input(
			idInput.extend({
				email: z.email("That doesn't look like an email address.").max(254),
			}),
		)
		.handler(async ({ context, input }) => {
			const access = await accessTo(context.db, context.me, input.eventId);
			const row = access.event;
			const guest = requireInviter(access);
			const [friend] = await findOrCreatePeople(
				context.db,
				[input.email],
				"guest",
			);
			if (!friend || friend.status === "deactivated") {
				throw new ORPCError("BAD_REQUEST", {
					message: "That address can't be invited.",
				});
			}
			if (friend.id === context.me.id) {
				throw new ORPCError("BAD_REQUEST", {
					message: "You're already on the list.",
				});
			}
			const id = crypto.randomUUID();
			// Plain names, not drizzle columns: see the potluck claim above.
			const result = await context.db.run(sql`
				insert into event_guest (id, event_id, user_id, source, added_by)
				select ${id}, ${row.id}, ${friend.id}, 'guest', ${guest.userId}
				where (
					select count(*) from event_guest
					where event_id = ${row.id}
						and added_by = ${guest.userId}
						and source = 'guest'
				) < ${row.guestInviteLimit}
				on conflict do nothing
			`);
			if (result.meta.changes !== 1) {
				const already = await context.db
					.select({ id: eventGuest.id })
					.from(eventGuest)
					.where(
						and(
							eq(eventGuest.eventId, row.id),
							eq(eventGuest.userId, friend.id),
						),
					)
					.get();
				throw new ORPCError("BAD_REQUEST", {
					message: already
						? "They're already on the list."
						: `You've invited ${row.guestInviteLimit}, the most this party allows.`,
				});
			}
			const sent = await sendInvites(context.db, row, context.me.id, {
				onlyGuestIds: [id],
				invitedBy: context.me.name,
			});
			return { ok: true, emailed: sent.sent > 0, created: friend.created };
		}),

	/**
	 * Take back an invitation you made, while they have not answered. Once
	 * they have, they are a guest like any other and only a host removes them.
	 */
	uninviteFriend: personProcedure
		.input(idInput.extend({ guestId: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const access = await accessTo(context.db, context.me, input.eventId);
			const guest = access.guest;
			if (!guest) {
				throw new ORPCError("BAD_REQUEST", { message: "Not your guest." });
			}
			const result = await context.db
				.delete(eventGuest)
				.where(
					and(
						eq(eventGuest.id, input.guestId),
						eq(eventGuest.eventId, access.event.id),
						eq(eventGuest.addedBy, guest.userId),
						eq(eventGuest.source, "guest"),
						isNull(eventGuest.response),
					),
				)
				.run();
			if (result.meta.changes !== 1) {
				throw new ORPCError("BAD_REQUEST", {
					message: "They've already answered; ask the hosts.",
				});
			}
			return { ok: true };
		}),
};

/**
 * The caller's own invitation, if it lets them invite: the event allows
 * guest invites, it is out and not over, and the host chose them.
 */
function requireInviter(access: Access) {
	const row = access.event;
	const guest = access.guest;
	if (!guest || !canInviteOthers(guest.source)) {
		throw new ORPCError("FORBIDDEN", {
			message: "Only guests the hosts invited can invite others.",
		});
	}
	if (!row.guestInvites) {
		throw new ORPCError("FORBIDDEN", {
			message: "The hosts aren't taking extra guests for this one.",
		});
	}
	if (row.status !== "published") {
		throw new ORPCError("BAD_REQUEST", {
			message:
				row.status === "canceled"
					? "It's been canceled."
					: "It hasn't gone out.",
		});
	}
	const start = startsAt(row);
	if (start && Date.now() >= start.getTime()) {
		throw new ORPCError("BAD_REQUEST", { message: "It's already started." });
	}
	return guest;
}
