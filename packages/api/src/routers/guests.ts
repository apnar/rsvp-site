import { ORPCError } from "@orpc/server";
import { remember } from "@rsvp-site/db/address-book";
import { parseGuests } from "@rsvp-site/db/addresses";
import { arrivalOf } from "@rsvp-site/db/arrival";
import { batchAll, built, insertChunks, rawBatch } from "@rsvp-site/db/batch";
import { pickable } from "@rsvp-site/db/families";
import {
	findOrCreatePeople,
	nameOnlyFromBook,
	setRealEmail,
} from "@rsvp-site/db/people";
import { isAdmin } from "@rsvp-site/db/roles";
import { contactGroup, contactGroupMember } from "@rsvp-site/db/schema/contact";
import {
	eventGuest,
	GUEST_RESPONSES,
	potluckClaim,
} from "@rsvp-site/db/schema/event";
import { vouchForTexts } from "@rsvp-site/db/sms-status";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { answersOf } from "../answer-words";
import { answer, answerInput } from "../answers";
import {
	type Access,
	accessTo,
	designFormatOf,
	emailsHeld,
	guestsOf,
	potluckOf,
} from "../events";
import { inviteRefusal } from "../guest-invites";
import {
	headcount,
	notInvitedCount,
	seenNoReplyCount,
	tally,
} from "../headcount";
import { withHostEvent, withLiveHostEvent } from "../host-event";
import { hostProcedure, personProcedure } from "../index";
import { emailSchema, idInput, idSchema } from "../inputs";
import { sendInvites } from "../mail";
import { recordView } from "../views";

export const guestsRouter = {
	/** The host's guest list: every row, the totals, and the potluck. */
	list: hostProcedure
		.input(idInput)
		.use(withHostEvent)
		.handler(async ({ context }) => {
			const row = context.event;
			const [guests, potluck, designFormat] = await Promise.all([
				guestsOf(context.db, row.id),
				potluckOf(context.db, row.id),
				designFormatOf(context.db, row),
			]);
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
					designFormat,
				},
				totals,
				headcount: headcount(totals),
				notInvited: notInvitedCount(guests),
				seenNoReply: seenNoReplyCount(guests),
				potluck: potluck.lines,
				answers: answersOf(row),
				guests: guests.map((g) => ({
					...g,
					bringing: (potluck.byGuest.get(g.id) ?? []).map((c) => c.label),
				})),
			};
		}),

	/**
	 * Put people on the list: pasted addresses, picks from what the host can
	 * see (address book, families, shared groups), whole contact groups, or
	 * any mix. New addresses become accounts, and
	 * everybody the host adds goes into their address book. Nobody is
	 * emailed here -- the host sends when ready.
	 */
	add: hostProcedure
		.input(
			idInput.extend({
				emails: z.string().max(20_000).default(""),
				groupIds: z.array(idSchema).max(50).default([]),
				/** People the caller can see: book, families, own or shared groups. Anybody else is ignored. */
				userIds: z.array(idSchema).max(1000).default([]),
				/**
				 * The host's word that the people whose numbers they typed
				 * expect a text from them: the consent carriers ask about.
				 */
				textsOk: z.boolean().default(false),
			}),
		)
		.use(withLiveHostEvent)
		.handler(async ({ context, input }) => {
			const row = context.event;
			// Lines with a name and no address: on a paper event anybody (the
			// card is their invitation), elsewhere only with a phone to text.
			const parsed = parseGuests(input.emails);
			const typed = parsed.flatMap((t) =>
				t.email ? [{ ...t, email: t.email }] : [],
			);
			const names = parsed.filter((t) => !t.email && (row.paper || t.phone));
			if (!row.paper && names.length > 0 && !input.textsOk) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"People added by phone get the invitation by text. Tick the box to say they expect one from you.",
				});
			}

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
							isAdmin(context.me)
								? undefined
								: eq(contactGroup.ownerId, context.me.id),
						),
					)
					.all();
			}

			// Picks only count from what the caller can see -- their book,
			// families they can see, their own or shared groups -- so a guessed
			// user id adds nobody, and nobody deactivated is added.
			const picked = await pickable(context.db, context.me, input.userIds);

			// The cap is on everybody this one request adds, however they were
			// named: typed lines, picks and whole groups, a person in two of
			// those counted once. Checked before anybody is created, so a
			// refused request leaves no accounts behind.
			const known = new Set([...picked, ...members.map((m) => m.userId)]);
			const total = typed.length + names.length + known.size;
			if (total > 500) {
				throw new ORPCError("BAD_REQUEST", {
					message: `That's ${total} people, counting groups and picks. Add them 500 at a time.`,
				});
			}
			const people = await findOrCreatePeople(context.db, typed, "host");
			const named = await nameOnlyFromBook(
				context.db,
				context.me.id,
				names,
				"host",
			);

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
			const guestRows = unique.map((r) => ({
				id: crypto.randomUUID(),
				eventId: row.id,
				userId: r.userId,
				source: r.source,
				addedBy: context.me.id,
			}));
			// One batch: the list lands whole or not at all.
			const inserted = await batchAll(
				context.db,
				insertChunks(eventGuest, guestRows).map((slice) =>
					context.db
						.insert(eventGuest)
						.values(slice)
						.onConflictDoNothing()
						.returning({ id: eventGuest.id }),
				),
			);
			const added = inserted.flat().length;
			// Whoever the host chose is in their book from now on.
			await remember(
				context.db,
				context.me.id,
				unique.map((r) => r.userId),
			);
			if (input.textsOk) {
				const phoned = new Set(
					typed.flatMap((t) => (t.phone ? [t.email] : [])),
				);
				await vouchForTexts(
					context.db,
					[
						...usable.filter((p) => phoned.has(p.email)).map((p) => p.id),
						...named.filter((p) => p.phone).map((p) => p.id),
					],
					context.me.id,
				);
			}
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
			idInput
				.extend({
					guestId: idSchema,
					response: z.enum(GUEST_RESPONSES).nullable(),
					adults: z.number().int().min(0).max(50),
					kids: z.number().int().min(0).max(50),
				})
				// Adults may be 0 (a child's own row is a kid), but somebody
				// has to be coming.
				.refine(
					(v) => !v.response || v.response === "no" || v.adults + v.kids >= 1,
					{
						message: "Somebody has to be coming.",
					},
				),
		)
		.use(withLiveHostEvent)
		.handler(async ({ context, input }) => {
			const row = context.event;
			const update = context.db
				.update(eventGuest)
				.set({
					response: input.response,
					adults: input.response === "no" ? 1 : input.adults,
					kids: input.response === "no" ? 0 : input.kids,
					respondedAt: input.response ? new Date() : null,
					respondedVia: input.response ? "host" : null,
					// The host recorded this, not a relative.
					answeredBy: null,
				})
				.where(
					and(eq(eventGuest.id, input.guestId), eq(eventGuest.eventId, row.id)),
				);
			// One atomic batch, so a "no" can't land without its claims going.
			// The delete is scoped to this event's guest, as the update is.
			const [result] =
				input.response === "no"
					? await context.db.batch([
							update,
							context.db.delete(potluckClaim).where(
								inArray(
									potluckClaim.guestId,
									context.db
										.select({ id: eventGuest.id })
										.from(eventGuest)
										.where(
											and(
												eq(eventGuest.id, input.guestId),
												eq(eventGuest.eventId, row.id),
											),
										),
								),
							),
						])
					: await context.db.batch([update]);
			if (result.meta.changes !== 1) {
				throw new ORPCError("NOT_FOUND", { message: "No such guest." });
			}
			return { ok: true };
		}),

	/** Take somebody off the list, and with them their answer and their claims. */
	remove: hostProcedure
		.input(idInput.extend({ guestId: idSchema }))
		.use(withHostEvent)
		.handler(async ({ context, input }) => {
			const row = context.event;
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
		.input(idInput.merge(answerInput))
		.handler(async ({ context, input }) => {
			const access = await accessTo(context.db, context.me, input.eventId);
			return answer(
				context.db,
				access,
				context.me,
				input,
				arrivalOf(context.headers),
			);
		}),

	/** The guest has their invite page on screen (see `recordView`). */
	viewed: personProcedure.input(idInput).handler(async ({ context, input }) => {
		const access = await accessTo(context.db, context.me, input.eventId);
		await recordView(context.db, access, arrivalOf(context.headers));
		return { ok: true as const };
	}),

	/**
	 * Give a name-only guest an email address, so they can get email once
	 * it starts. An address somebody already has is refused rather than
	 * merged: the host removes this guest and invites that person instead.
	 */
	setEmail: hostProcedure
		.input(
			idInput.extend({
				guestId: idSchema,
				email: emailSchema,
			}),
		)
		.use(withHostEvent)
		.handler(async ({ context, input }) => {
			const row = context.event;
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
	 * The host's word, after the fact, that a guest with a phone expects a
	 * text from them. Only fills a blank on a record nobody has claimed
	 * (`vouchForTexts`): somebody who switched texts off, or signed in and
	 * speaks for themselves, is left alone.
	 */
	allowTexts: hostProcedure
		.input(idInput.extend({ guestId: idSchema }))
		.use(withLiveHostEvent)
		.handler(async ({ context, input }) => {
			const guest = await context.db
				.select({ userId: eventGuest.userId })
				.from(eventGuest)
				.where(
					and(
						eq(eventGuest.id, input.guestId),
						eq(eventGuest.eventId, context.event.id),
					),
				)
				.get();
			if (!guest)
				throw new ORPCError("NOT_FOUND", { message: "No such guest." });
			const done = await vouchForTexts(
				context.db,
				[guest.userId],
				context.me.id,
			);
			if (done.length === 0) {
				throw new ORPCError("BAD_REQUEST", {
					message: "They decide about texts themselves now.",
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
	 * The cap is on invitations ever sent (`invites_sent` on the inviter's
	 * own row), not on friends who are still listed: taking one back must not
	 * hand the invitation back, or invite, uninvite, repeat would email any
	 * address without end. The friend's INSERT is guarded on that counter
	 * and the counter is bumped in the same atomic batch, so two quick
	 * invites cannot both slip under it; a refused insert is then told apart
	 * from a friend who was already on the list.
	 */
	inviteFriend: personProcedure
		.input(
			idInput.extend({
				email: emailSchema,
			}),
		)
		.handler(async ({ context, input }) => {
			// Per person, not per IP: the cap bounds one guest's invitations to
			// one party, this bounds the attempts (each can mint an account) and
			// shares AUTH_LIMITER's 10 a minute, which no honest guest reaches.
			const { success } = await context.env.AUTH_LIMITER.limit({
				key: `invite:${context.me.id}`,
			});
			if (!success) {
				throw new ORPCError("TOO_MANY_REQUESTS", {
					message: "Slow down a little, then try again.",
				});
			}
			const access = await accessTo(context.db, context.me, input.eventId);
			const row = access.event;
			const guest = requireInviter(access);
			// Checked before anybody is created, so a guest at their cap can't
			// keep minting accounts. The guarded INSERT below is the real lock.
			if (guest.invitesSent >= row.guestInviteLimit) {
				throw new ORPCError("BAD_REQUEST", {
					message: `You've invited ${row.guestInviteLimit}, the most this party allows.`,
				});
			}
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
			// Plain names, not drizzle columns: see the potluck claim above. The
			// counter moves only if the friend's row went in, and D1 runs a
			// batch as one transaction, so the two cannot come apart.
			const [inserted] = await rawBatch(context.db.$client, [
				built(sql`
					insert into event_guest (id, event_id, user_id, source, added_by)
					select ${id}, ${row.id}, ${friend.id}, 'guest', ${guest.userId}
					where (
						select invites_sent from event_guest where id = ${guest.id}
					) < ${row.guestInviteLimit}
					on conflict do nothing
				`),
				built(sql`
					update event_guest set invites_sent = invites_sent + 1
					where id = ${guest.id}
						and exists (select 1 from event_guest where id = ${id})
				`),
			]);
			if (inserted?.meta.changes !== 1) {
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
			// No `created`: it would tell a guest whether an address has an account.
			return { ok: true, emailed: sent.sent > 0 };
		}),

	/**
	 * Take back an invitation you made, while they have not answered. Once
	 * they have, they are a guest like any other and only a host removes them. The
	 * invitation is not given back: `invites_sent` stays where it was.
	 */
	uninviteFriend: personProcedure
		.input(idInput.extend({ guestId: idSchema }))
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
	const refusal = inviteRefusal(access.event, access.guest);
	if (refusal || !access.guest) {
		throw new ORPCError(refusal?.code ?? "FORBIDDEN", {
			message: refusal?.message,
		});
	}
	return access.guest;
}
