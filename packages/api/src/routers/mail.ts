import { ORPCError } from "@orpc/server";
import { formatPhone } from "@rsvp-site/db/phone";
import { user } from "@rsvp-site/db/schema/auth";
import { emailSend } from "@rsvp-site/db/schema/email";
import { event } from "@rsvp-site/db/schema/event";
import { smsSend } from "@rsvp-site/db/schema/sms";
import { getMailer } from "@rsvp-site/email/worker";
import { describeCode } from "@rsvp-site/sms";
import { getTexter, textingFrom } from "@rsvp-site/sms/worker";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure } from "../index";
import { countEveryone, renderMessage, sendToList, tokensFor } from "../mail";
import { sendTestText } from "../texting";

const messageSchema = z.object({
	subject: z.string().trim().min(1, "Subject?").max(120),
	body: z.string().trim().min(1, "Say something.").max(5000),
});

/**
 * The send log keeps lists as JSON text. A row that is not an array (an old
 * shape, a hand edit) reads as empty rather than taking the whole log down.
 */
function parseArray<T>(raw: string): T[] {
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as T[]) : [];
	} catch {
		return [];
	}
}

/** Admin mail: the site-wide message and the log of everything sent. */
export const mailRouter = {
	/** Whether emails actually leave the building (BREVO_API_KEY is set). */
	status: adminProcedure.handler(async ({ context }) => ({
		dryRun: getMailer().dryRun,
		everyone: await countEveryone(context.db),
		/** Texts are logged, not sent (no TELNYX_API_KEY, on localhost). */
		textDryRun: getTexter().dryRun,
		textingFrom: formatPhone(textingFrom()),
	})),

	/** A test text to the admin's own phone, to see texting work end to end. */
	testText: adminProcedure.handler(async ({ context }) => {
		const outcome = await sendTestText(context.db, context.me);
		if (!outcome.ok) {
			throw new ORPCError("BAD_REQUEST", {
				message: outcome.code
					? `Telnyx said no (${outcome.code}): ${outcome.error}`
					: outcome.error,
			});
		}
		return { ok: true };
	}),

	/**
	 * The last texts, newest first, with how each fared. Numbers are shown
	 * to admins only; this is the place to see a carrier refusing them.
	 */
	recentTexts: adminProcedure.handler(async ({ context }) => {
		const rows = await context.db
			.select({
				id: smsSend.id,
				kind: smsSend.kind,
				phone: smsSend.phone,
				status: smsSend.status,
				errorCode: smsSend.errorCode,
				error: smsSend.error,
				parts: smsSend.parts,
				media: smsSend.media,
				createdAt: smsSend.createdAt,
				name: user.name,
				eventTitle: event.title,
			})
			.from(smsSend)
			.leftJoin(user, eq(user.id, smsSend.userId))
			.leftJoin(event, eq(event.id, smsSend.eventId))
			.orderBy(desc(smsSend.createdAt))
			.limit(50)
			.all();
		return rows.map((r) => ({
			...r,
			phone: formatPhone(r.phone),
			reason: r.status === "failed" ? describeCode(r.errorCode) : null,
		}));
	}),

	previewMessage: adminProcedure
		.input(messageSchema)
		.handler(async ({ context, input }) => ({
			...renderMessage(input),
			recipientCount: await countEveryone(context.db),
		})),

	/**
	 * A message to everybody on the site, or only to yourself as a test.
	 * Nobody unsubscribed or deactivated gets it either way.
	 */
	sendMessage: adminProcedure
		.input(messageSchema.extend({ toSelf: z.boolean().default(false) }))
		.handler(async ({ context, input }) => {
			const rendered = renderMessage(input);
			if (input.toSelf) {
				const me = context.me;
				// The test copy has to render its links like the real thing, so it
				// carries the admin's own tokens.
				const { key, unsubscribeUrl } = await tokensFor(context.db, me.id);
				const outcome = await getMailer().sendOne(
					{ email: me.email, name: me.name },
					rendered,
					{
						tags: ["message", "test"],
						params: { unsubscribeUrl, key },
					},
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
			const result = await sendToList(context.db, {
				kind: "message",
				rendered,
				sentBy: context.me.id,
			});
			if (!result) {
				throw new ORPCError("BAD_REQUEST", { message: "Nobody to send to." });
			}
			return result;
		}),

	/** The last few sends of every kind, newest first. */
	recent: adminProcedure.handler(async ({ context }) => {
		const rows = await context.db
			.select({
				id: emailSend.id,
				kind: emailSend.kind,
				subject: emailSend.subject,
				audience: emailSend.audience,
				recipientCount: emailSend.recipientCount,
				failedCount: emailSend.failedCount,
				messageIds: emailSend.messageIds,
				errors: emailSend.errors,
				createdAt: emailSend.createdAt,
				eventTitle: event.title,
			})
			.from(emailSend)
			.leftJoin(event, eq(event.id, emailSend.eventId))
			.orderBy(desc(emailSend.createdAt))
			.limit(30)
			.all();
		return rows.map((row) => ({
			...row,
			messageIds: parseArray<string>(row.messageIds),
			errors: parseArray<{ emails: string[]; error: string }>(row.errors),
		}));
	}),
};
