import { ORPCError } from "@orpc/server";
import { user } from "@rsvp-site/db/schema/auth";
import { event, eventGuest } from "@rsvp-site/db/schema/event";
import { nudgeEmail } from "@rsvp-site/email";
import { getMailer } from "@rsvp-site/email/worker";
import { nudgeText } from "@rsvp-site/sms";
import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";

import { needsQr } from "../../design-rules";
import { savedDesign } from "../../designs-store";
import { callOff } from "../../endings";
import { emailsHeld } from "../../event-rules";
import { type EventRow, findEvent, requireOpen } from "../../events";
import { withHostEvent, withLiveHostEvent } from "../../host-event";
import { hostProcedure } from "../../index";
import { idInput, idSchema } from "../../inputs";
import {
	deliver,
	eventFacts,
	releaseGuestClaim,
	sendInvites,
} from "../../mail";
import { textFactsFor } from "../../texting";

/** How long before the same person can be nudged again. */
const NUDGE_COOLDOWN_MS = 12 * 60 * 60 * 1000;

function requirePublishable(row: EventRow) {
	if (!row.date) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Give it a date before sending.",
		});
	}
}

export const sendingRouter = {
	/**
	 * Send the invitations: publishes a draft, and on a published event sends
	 * to whoever was added since. Each person gets one invitation, ever.
	 *
	 * A paper event is only published here -- its QR codes start working --
	 * and nobody is emailed until the host presses "Start emails".
	 */
	send: hostProcedure
		.input(idInput)
		.use(withLiveHostEvent)
		.handler(async ({ context }) => {
			const before = context.event;
			requirePublishable(before);
			if (before.paper && before.designOn) {
				// The paper switch can be turned on after the card was designed.
				const saved = await savedDesign(context.db, before.id);
				needsQr(before, true, saved?.doc ?? null);
			}
			if (before.status === "draft") {
				await context.db
					.update(event)
					.set({ status: "published", publishedAt: new Date() })
					.where(and(eq(event.id, before.id), eq(event.status, "draft")));
			}
			const row = (await findEvent(context.db, before.id)) ?? before;
			if (emailsHeld(row)) {
				return { sent: 0, failed: 0, skipped: 0, held: true, dryRun: false };
			}
			const outcome = await sendInvites(context.db, row, context.me.id);
			return { ...outcome, held: false, dryRun: getMailer().dryRun };
		}),

	/**
	 * "Start emails" on a paper event: from now on it behaves like any other.
	 * Claimed with a guarded UPDATE so a double press emails nobody twice,
	 * then everybody with an address gets the invitation by email too.
	 */
	releaseEmails: hostProcedure
		.input(idInput)
		.use(withHostEvent)
		.handler(async ({ context }) => {
			const row = context.event;
			if (!row.paper || row.status !== "published") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Only a sent paper event has emails to start.",
				});
			}
			const now = new Date();
			const result = await context.db
				.update(event)
				.set({ emailsReleasedAt: now })
				.where(and(eq(event.id, row.id), isNull(event.emailsReleasedAt)))
				.run();
			if (result.meta.changes !== 1) {
				return { sent: 0, failed: 0, skipped: 0, dryRun: getMailer().dryRun };
			}
			// Whoever answered from the card already has the invitation and is
			// skipped below; record it, or they would count as still to invite
			// (a later Send would email them "You're invited") and drop out of
			// the reminders and notices that go to invited guests.
			await context.db
				.update(eventGuest)
				.set({ invitedAt: now })
				.where(
					and(
						eq(eventGuest.eventId, row.id),
						isNull(eventGuest.invitedAt),
						isNotNull(eventGuest.response),
						inArray(
							eventGuest.userId,
							context.db
								.select({ id: user.id })
								.from(user)
								.where(eq(user.noEmail, false)),
						),
					),
				);
			const outcome = await sendInvites(
				context.db,
				{ ...row, emailsReleasedAt: now },
				context.me.id,
				{ skipAnswered: true },
			);
			return { ...outcome, dryRun: getMailer().dryRun };
		}),

	/** Call it off, and tell everybody who was still coming if asked to. */
	cancel: hostProcedure
		.input(
			idInput.extend({
				note: z.string().trim().max(1000).default(""),
				notify: z.boolean().default(true),
			}),
		)
		.use(withHostEvent)
		.handler(async ({ context, input }) => {
			const row = context.event;
			if (row.status !== "published") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Only a sent event can be canceled. Delete a draft instead.",
				});
			}
			return callOff(context.db, row, {
				note: input.note,
				notify: input.notify,
				sentBy: context.me.id,
				pictures: true,
			});
		}),

	/**
	 * Nudge the people who have the invitation and have not answered: all of
	 * them, or one. Each person is nudged at most once every twelve hours,
	 * claimed in the UPDATE so two hosts pressing at once send one email.
	 */
	nudge: hostProcedure
		.input(idInput.extend({ guestId: idSchema.optional() }))
		.use(withHostEvent)
		.handler(async ({ context, input }) => {
			const row = context.event;
			requireOpen(row);
			if (emailsHeld(row)) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Emails are on hold until you start them.",
				});
			}
			const now = new Date();
			const claimed = await context.db
				.update(eventGuest)
				.set({ nudgedAt: now })
				.where(
					and(
						eq(eventGuest.eventId, row.id),
						input.guestId ? eq(eventGuest.id, input.guestId) : undefined,
						isNull(eventGuest.response),
						isNotNull(eventGuest.invitedAt),
						or(
							isNull(eventGuest.nudgedAt),
							lt(
								eventGuest.nudgedAt,
								new Date(now.getTime() - NUDGE_COOLDOWN_MS),
							),
						),
					),
				)
				.returning({ id: eventGuest.id, userId: eventGuest.userId })
				.all();
			if (claimed.length === 0) {
				return { sent: 0, waiting: true };
			}
			const giveBack = () =>
				releaseGuestClaim(context.db, row.id, "nudgedAt", now, {
					by: "id",
					ids: claimed.map((c) => c.id),
				});
			let result: Awaited<ReturnType<typeof deliver>>;
			try {
				const facts = await textFactsFor(context.db, row);
				result = await deliver(context.db, {
					kind: "nudge",
					eventId: row.id,
					people: claimed.map((c) => c.userId),
					rendered: nudgeEmail(eventFacts(row)),
					text: (link) => nudgeText(facts, link),
					path: `/e/${row.id}`,
					sentBy: context.me.id,
				});
			} catch (error) {
				await giveBack();
				throw error;
			}
			// The stamp was only a claim on sending: it goes back for whoever
			// nothing reached (nobody reachable, or every channel refused), so
			// they aren't left waiting twelve hours for a nudge they never got.
			if (!result) await giveBack();
			else if (result.failedIds.length > 0) {
				const lost = new Set(result.failedIds);
				await releaseGuestClaim(context.db, row.id, "nudgedAt", now, {
					by: "id",
					ids: claimed.filter((c) => lost.has(c.userId)).map((c) => c.id),
				});
			}
			return { sent: result?.sent ?? 0, waiting: false };
		}),
};
