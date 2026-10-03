import { ORPCError } from "@orpc/server";
import { normalizeEmail } from "@rsvp-site/db/addresses";
import { batchAll } from "@rsvp-site/db/batch";
import { canHost } from "@rsvp-site/db/roles";
import { user } from "@rsvp-site/db/schema/auth";
import {
	event,
	eventDesign,
	eventGuest,
	eventHost,
	HOST_ALERTS,
	potluckItem,
} from "@rsvp-site/db/schema/event";
import { newToken } from "@rsvp-site/db/tokens";
import { updateEmail } from "@rsvp-site/email";
import { siteUrl } from "@rsvp-site/email/worker";
import { and, eq, notInArray } from "drizzle-orm";
import { z } from "zod";
import { describeChanges, movesGuestFacts, rearmFor } from "../../event-rules";
import {
	designedCard,
	emailsHeld,
	findEvent,
	guestsOf,
	hostsOf,
	labelsOf,
	potluckOf,
	stillComing,
	YOUR_GUEST,
} from "../../events";
import { notInvitedCount, stillComingCount } from "../../headcount";
import {
	liveHostEvent,
	withHostEvent,
	withLiveHostEvent,
} from "../../host-event";
import { hostProcedure } from "../../index";
import { emailSchema, idInput, idSchema } from "../../inputs";
import { eventFacts, sendToList } from "../../mail";
import { deleteDesignMedia } from "../../media";

// A real calendar date and clock time, not just the right shape: 2026-13-01
// would otherwise be stored and then throw in formatDate on every page.
const dateSchema = z.iso.date("Pick a date.").nullable();
const timeSchema = z.iso
	.time({ precision: -1, error: "Pick a time." })
	.nullable();

/** Everything a host can set on the editor. All optional on update. */
const eventFields = z.object({
	title: z.string().trim().min(1, "Give it a name.").max(120),
	hostLine: z.string().trim().max(120),
	date: dateSchema,
	startTime: timeSchema,
	endTime: timeSchema,
	location: z.string().trim().max(200),
	details: z.string().trim().max(5000),
	extraDetails: z.string().trim().max(5000),
	rsvpDeadline: dateSchema,
	maxPlusOnes: z.number().int().min(0).max(20),
	askKids: z.boolean(),
	askDietary: z.boolean(),
	askNote: z.boolean(),
	potluckEnabled: z.boolean(),
	showGuestNames: z.boolean(),
	shareEnabled: z.boolean(),
	paper: z.boolean(),
	guestInvites: z.boolean(),
	guestInviteLimit: z.number().int().min(1).max(20),
	remindDeadline: z.boolean(),
	remindDaysBefore: z.number().int().min(0).max(30),
	remindDayBefore: z.boolean(),
	notifyChanges: z.boolean(),
	hostAlerts: z.enum(HOST_ALERTS),
});

const potluckInput = z
	.array(
		z.object({
			id: idSchema.optional(),
			label: z.string().trim().min(1).max(80),
			quantity: z.number().int().min(1).max(99),
		}),
	)
	.max(40);

export const editorRouter = {
	/** Everything the editor needs. */
	get: hostProcedure
		.input(idInput)
		.use(withHostEvent)
		.handler(async ({ context }) => {
			const row = context.event;
			const [guests, potluck, hosts, designed, card] = await Promise.all([
				guestsOf(context.db, row.id),
				potluckOf(context.db, row.id),
				hostsOf(context.db, row.id),
				context.db
					.select({ version: eventDesign.version })
					.from(eventDesign)
					.where(eq(eventDesign.eventId, row.id))
					.get(),
				designedCard(context.db, row, "web", YOUR_GUEST),
			]);
			return {
				event: row,
				emailsHeld: emailsHeld(row),
				hasDesign: designed !== undefined,
				card: card?.scene ?? null,
				labels: labelsOf(row),
				hosts,
				guests: guests.map((g) => ({
					id: g.id,
					userId: g.userId,
					name: g.name,
					email: g.email,
					response: g.response,
					invitedAt: g.invitedAt,
					unreachable: g.unreachable,
				})),
				potluck: potluck.lines,
				notInvited: notInvitedCount(guests),
				stillComing: stillComingCount(guests),
				shareUrl: `${siteUrl()}/i/${row.shareToken}`,
			};
		}),

	/** A new draft, owned by the caller. */
	create: hostProcedure
		.input(eventFields.partial().extend({ title: eventFields.shape.title }))
		.handler(async ({ context, input }) => {
			const id = crypto.randomUUID();
			await context.db.batch([
				context.db.insert(event).values({
					id,
					shareToken: newToken(),
					createdBy: context.me.id,
					...input,
				}),
				context.db
					.insert(eventHost)
					.values({ eventId: id, userId: context.me.id, isOwner: true }),
			]);
			return { id };
		}),

	/**
	 * Save the editor. On a published event with `notifyChanges`, moving the
	 * date, time or place tells everybody still coming -- the editor says so
	 * on the button, so the host knows mail will go.
	 */
	update: hostProcedure
		.input(idInput.extend({ fields: eventFields.partial() }))
		.use(liveHostEvent("It's canceled. Make a new one instead."))
		.handler(async ({ context, input }) => {
			const before = context.event;
			const fields = { ...input.fields };
			// Answers close and reminders fire off the date, so only a draft
			// may be without one.
			if (fields.date === null && before.status !== "draft") {
				throw new ORPCError("BAD_REQUEST", {
					message: "A sent invitation needs a date.",
				});
			}
			if (
				fields.paper !== undefined &&
				fields.paper !== before.paper &&
				before.status !== "draft"
			) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"Paper or email is chosen before sending. It can't change now.",
				});
			}
			const moved = movesGuestFacts(before, fields);
			const rearm = rearmFor(before, fields);
			// One batch (atomic on D1): the edit and, when a draft goes back to
			// email, the end of its printed keys land together or not at all.
			await batchAll(context.db, [
				context.db
					.update(event)
					.set({ ...fields, ...rearm })
					.where(eq(event.id, before.id)),
				...(fields.paper === false && before.paper
					? [
							// Cards printed for a draft that goes back to email must not
							// keep signing anybody in.
							context.db
								.update(eventGuest)
								.set({ paperToken: null })
								.where(eq(eventGuest.eventId, before.id)),
						]
					: []),
			]);
			const after = (await findEvent(context.db, before.id)) ?? before;

			let notified = 0;
			if (
				before.status === "published" &&
				after.notifyChanges &&
				moved &&
				!emailsHeld(after)
			) {
				const changes = describeChanges(before, after);
				if (changes.length > 0) {
					const result = await sendToList(context.db, {
						kind: "update",
						eventId: after.id,
						rendered: updateEmail(eventFacts(after), changes),
						sentBy: context.me.id,
						onlyPersonIds: await stillComing(context.db, after.id),
					});
					notified = result?.sent ?? 0;
				}
			}
			return { ok: true, notified };
		}),

	/**
	 * Replace the potluck list. Items missing from the new list go, and the
	 * claims on them with them; kept items keep their claims even if the
	 * quantity drops below what is claimed (the page shows them as full).
	 */
	setPotluck: hostProcedure
		.input(idInput.extend({ items: potluckInput }))
		.use(withLiveHostEvent)
		.handler(async ({ context, input }) => {
			const row = context.event;
			const keep = input.items.flatMap((i) => (i.id ? [i.id] : []));
			const clear = context.db
				.delete(potluckItem)
				.where(
					keep.length
						? and(
								eq(potluckItem.eventId, row.id),
								notInArray(potluckItem.id, keep),
							)
						: eq(potluckItem.eventId, row.id),
				);
			const writes = input.items.map((item, sort) =>
				item.id
					? context.db
							.update(potluckItem)
							.set({ label: item.label, quantity: item.quantity, sort })
							.where(
								and(
									eq(potluckItem.id, item.id),
									eq(potluckItem.eventId, row.id),
								),
							)
					: context.db.insert(potluckItem).values({
							id: crypto.randomUUID(),
							eventId: row.id,
							label: item.label,
							quantity: item.quantity,
							sort,
						}),
			);
			await context.db.batch([clear, ...writes]);
			return { ok: true };
		}),

	/**
	 * Make somebody a co-host by address. They must already be a host: being
	 * able to run events is an admin's call, not another host's.
	 */
	addCohost: hostProcedure
		.input(idInput.extend({ email: emailSchema }))
		.use(withLiveHostEvent)
		.handler(async ({ context, input }) => {
			const row = context.event;
			const person = await context.db
				.select({ id: user.id, role: user.role, status: user.status })
				.from(user)
				.where(eq(user.email, normalizeEmail(input.email)))
				.get();
			if (!person || person.status === "deactivated" || !canHost(person)) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"Co-hosts have to be hosts on the site. Ask an admin to make them one.",
				});
			}
			await context.db
				.insert(eventHost)
				.values({ eventId: row.id, userId: person.id })
				.onConflictDoNothing();
			return { ok: true };
		}),

	removeCohost: hostProcedure
		.input(idInput.extend({ userId: idSchema }))
		.use(withHostEvent)
		.handler(async ({ context, input }) => {
			const row = context.event;
			const result = await context.db
				.delete(eventHost)
				.where(
					and(
						eq(eventHost.eventId, row.id),
						eq(eventHost.userId, input.userId),
						eq(eventHost.isOwner, false),
					),
				)
				.run();
			if (result.meta.changes !== 1) {
				throw new ORPCError("BAD_REQUEST", {
					message: "The owner stays. Remove a co-host instead.",
				});
			}
			return { ok: true };
		}),

	/** Delete a draft or a canceled event. A live one must be canceled first. */
	remove: hostProcedure
		.input(idInput)
		.use(withHostEvent)
		.handler(async ({ context }) => {
			const row = context.event;
			if (row.status === "published") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Cancel it first, so the guests hear about it.",
				});
			}
			await context.db.delete(event).where(eq(event.id, row.id));
			if (row.coverKey) await context.env.MEDIA.delete(row.coverKey);
			await deleteDesignMedia(context.env, row.id);
			return { ok: true };
		}),
};
