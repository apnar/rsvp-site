import { ORPCError } from "@orpc/server";
import { emailSend } from "@rsvp-site/db/schema/email";
import { event } from "@rsvp-site/db/schema/event";
import { getMailer } from "@rsvp-site/email/worker";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure } from "../index";
import { countEveryone, renderMessage, sendToList, tokensFor } from "../mail";

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
	})),

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
