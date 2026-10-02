import { ORPCError } from "@orpc/server";
import {
	attachSend,
	type CallRow,
	closeCall,
	discardCall,
	findLatestCall,
	findMine,
	findOpenCall,
	listClosedCalls,
	listLedger,
	markContribution,
	markReminded,
	openCall,
	tally,
	tallyLine,
	unpaidIds,
} from "@rsvp-site/db/contributions";
import { listRecipients } from "@rsvp-site/db/people";
import { CONTRIBUTION_STATUSES } from "@rsvp-site/db/schema/contribution";
import { emailSend } from "@rsvp-site/db/schema/email";
import {
	CONTRIBUTION_REMINDER_BODY,
	contributionCallDefaults,
	type Rendered,
} from "@rsvp-site/email";
import { getMailer } from "@rsvp-site/email/worker";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Context } from "../context";
import { renderCall, renderReminder } from "../contributions-render";
import { isUniqueViolation } from "../db-errors";
import { adminProcedure, protectedProcedure } from "../index";
import { countRecipients, sendToList, tokensFor } from "../mail";

const callSchema = z.object({
	subject: z.string().trim().min(1, "Subject?").max(120),
	body: z.string().trim().min(1, "Say something.").max(5000),
	amount: z
		.number()
		.int("Whole dollars.")
		.positive("How much?")
		.max(10_000, "That is not a contribution, that is a mortgage."),
	/** One line. The facts table it lands in has no room for paragraphs. */
	instructions: z
		.string()
		.trim()
		.min(1, "How does it get to the host?")
		.max(200, "Shorter. It goes in a table."),
});

const reminderSchema = z.object({
	body: z.string().trim().min(1, "Say something.").max(5000),
});

const toSelf = { toSelf: z.boolean().default(false) };

function alreadyOpen(): never {
	throw new ORPCError("CONFLICT", {
		message: "A call is already open. Close the books on it first.",
	});
}

async function requireOpenCall(db: Context["db"]): Promise<CallRow> {
	const open = await findOpenCall(db);
	if (!open) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Nothing is open. Put out a call first.",
		});
	}
	return open;
}

/**
 * A test copy to the admin only. Same rendering as the real thing, the
 * admin's own tokens in the links, and no `email_send` row -- it is not a
 * send, it is a look.
 */
async function sendToMe(
	context: Context & { session: NonNullable<Context["session"]> },
	rendered: Rendered,
	tag: string,
) {
	const me = context.session.user;
	const { key, unsubscribeUrl } = await tokensFor(context.db, me.id);
	const outcome = await getMailer().sendOne(
		{ email: me.email, name: me.name },
		rendered,
		{ tags: [tag, "test"], params: { name: me.name, unsubscribeUrl, key } },
	);
	if (!outcome.ok) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: `Brevo said no: ${outcome.error}`,
		});
	}
	return {
		attempted: 1,
		sent: 1,
		failed: [],
		messageIds: [outcome.messageId],
		sendId: null,
	};
}

/**
 * The call's number and instructions ride along; only the words are new.
 * Spelled out rather than spread, because the call has a `body` of its own
 * and a spread would quietly send the original ask again.
 */
function reminderFor(open: CallRow, body: string) {
	return { body, amount: open.amount, instructions: open.instructions };
}

/**
 * The unpaid who would actually get a reminder: the ledger's unpaid side,
 * intersected with the live active list the same way `sendToList` will do
 * it. Somebody on a break still owes and is silently skipped, and the count
 * on the button has to be the count that gets mail.
 */
async function reminderAudience(db: Context["db"], callId: string) {
	const [ledger, active] = await Promise.all([
		listLedger(db, callId),
		listRecipients(db, "active"),
	]);
	const unpaid = unpaidIds(ledger);
	const reachable = new Set(active.map((p) => p.id));
	const ids = unpaid.filter((id) => reachable.has(id));
	return { ledger, unpaid, ids, away: unpaid.length - ids.length };
}

export const contributionsRouter = {
	/** Everything the admin page needs in one read. */
	current: adminProcedure.handler(async ({ context }) => {
		const [open, latest, activeCount] = await Promise.all([
			findOpenCall(context.db),
			findLatestCall(context.db),
			countRecipients(context.db),
		]);
		const defaults = {
			...contributionCallDefaults(latest?.amount ?? 0),
			reminderBody: CONTRIBUTION_REMINDER_BODY,
		};
		const prefill = latest
			? { amount: latest.amount, instructions: latest.instructions }
			: null;
		if (!open) return { open: null, prefill, defaults, activeCount };

		const [audience, send] = await Promise.all([
			reminderAudience(context.db, open.id),
			open.sendId
				? context.db
						.select({
							recipientCount: emailSend.recipientCount,
							failedCount: emailSend.failedCount,
						})
						.from(emailSend)
						.where(eq(emailSend.id, open.sendId))
						.get()
				: null,
		]);
		const t = tally(audience.ledger, open.amount);
		return {
			open: {
				...open,
				sentTo: send?.recipientCount ?? 0,
				failed: send?.failedCount ?? 0,
				ledger: audience.ledger,
				tally: t,
				tallyLine: tallyLine(t),
				unpaidReachable: audience.ids.length,
				unpaidAway: audience.away,
			},
			prefill,
			defaults,
			activeCount,
		};
	}),

	/** Closed calls with their final numbers, newest first. */
	history: adminProcedure.handler(async ({ context }) => {
		const calls = await listClosedCalls(context.db);
		return calls.map((c) => ({ ...c, tallyLine: tallyLine(c.tally) }));
	}),

	previewCall: adminProcedure
		.input(callSchema)
		.handler(async ({ context, input }) => ({
			...renderCall(input),
			recipientCount: await countRecipients(context.db),
		})),

	/**
	 * Put out the call. Read, decide, claim, send -- the cycle's order in
	 * miniature. The call row and its ledger go in before the email leaves,
	 * because the other way round fails wrong: Brevo accepts, the insert
	 * fails, and twenty-two people have been asked for money nothing tracks.
	 * A call whose email never left is discarded instead, which is the
	 * cheap side of that trade.
	 */
	sendCall: adminProcedure
		.input(callSchema.extend(toSelf))
		.handler(async ({ context, input }) => {
			if (await findOpenCall(context.db)) alreadyOpen();
			const { toSelf: testOnly, ...draft } = input;
			const rendered = renderCall(draft);
			if (testOnly) return sendToMe(context, rendered, "contribution_call");

			const people = await listRecipients(context.db, "active");
			if (people.length === 0) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Nobody is on the list.",
				});
			}
			const id = crypto.randomUUID();
			const userIds = people.map((p) => p.id);
			try {
				await openCall(context.db, {
					id,
					...draft,
					openedBy: context.session.user.id,
					userIds,
				});
			} catch (error) {
				// The double-click the check above cannot see; the index can.
				if (isUniqueViolation(error)) alreadyOpen();
				throw error;
			}

			let result: Awaited<ReturnType<typeof sendToList>>;
			try {
				result = await sendToList(context.db, {
					kind: "contribution_call",
					rendered,
					sentBy: context.session.user.id,
					onlyPersonIds: userIds,
				});
			} catch (error) {
				await discardCall(context.db, id);
				throw error;
			}
			if (!result || result.sent === 0) {
				await discardCall(context.db, id);
				const reason = result?.failed[0]?.error ?? "nobody to send to";
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: `Nothing went out. Brevo said: ${reason}`,
				});
			}
			await attachSend(context.db, id, result.sendId);
			return result;
		}),

	previewReminder: adminProcedure
		.input(reminderSchema)
		.handler(async ({ context, input }) => {
			const open = await requireOpenCall(context.db);
			const audience = await reminderAudience(context.db, open.id);
			return {
				...renderReminder(reminderFor(open, input.body)),
				recipientCount: audience.ids.length,
			};
		}),

	/** The nag, to whoever is still unpaid and still on the list. */
	sendReminder: adminProcedure
		.input(reminderSchema.extend(toSelf))
		.handler(async ({ context, input }) => {
			const open = await requireOpenCall(context.db);
			const rendered = renderReminder(reminderFor(open, input.body));
			if (input.toSelf) {
				return sendToMe(context, rendered, "contribution_reminder");
			}
			const audience = await reminderAudience(context.db, open.id);
			const result = await sendToList(context.db, {
				kind: "contribution_reminder",
				rendered,
				sentBy: context.session.user.id,
				onlyPersonIds: audience.ids,
			});
			if (!result) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						audience.unpaid.length === 0
							? "Everybody has paid. Close the books."
							: "Everybody who still owes is on a break. Nobody to send to.",
				});
			}
			if (result.sent > 0) await markReminded(context.db, open.id);
			return result;
		}),

	/** Tick a name. Only the open call takes marks; history is history. */
	mark: adminProcedure
		.input(
			z.object({
				userId: z.string().min(1),
				status: z.enum(CONTRIBUTION_STATUSES),
			}),
		)
		.handler(async ({ context, input }) => {
			const open = await requireOpenCall(context.db);
			const marked = await markContribution(context.db, {
				callId: open.id,
				userId: input.userId,
				status: input.status,
			});
			if (!marked) {
				throw new ORPCError("NOT_FOUND", {
					message: "They were not billed on this call.",
				});
			}
			return { ok: true };
		}),

	/** Close the books. Reminders stop, the notices go quiet, the tally stays. */
	close: adminProcedure.handler(async ({ context }) => {
		const open = await requireOpenCall(context.db);
		const closed = await closeCall(context.db, open.id);
		if (!closed) {
			throw new ORPCError("CONFLICT", { message: "Already closed." });
		}
		return { ok: true };
	}),

	/**
	 * The one thing a guest sees: their own row on the open call, or null.
	 * Never a list, never anybody else's name. Read from D1, not the session,
	 * for the usual reason -- the cookie is five minutes stale.
	 */
	mine: protectedProcedure.handler(async ({ context }) =>
		findMine(context.db, context.session.user.id),
	),
};
