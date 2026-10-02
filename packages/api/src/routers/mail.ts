import { ORPCError } from "@orpc/server";
import { EMAIL_AUDIENCES, emailSend } from "@rsvp-site/db/schema/email";
import { game } from "@rsvp-site/db/schema/game";
import { getMailer } from "@rsvp-site/email/worker";
import { asc, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";

import { union } from "../audience";
import type { Context } from "../context";
import { STAGES, type StageKey } from "../cycle";
import { findGame, listGames } from "../games";
import { adminProcedure } from "../index";
import { renderStage } from "../jobs/stage-render";
import {
	countRecipients,
	permitUrl,
	readSplit,
	recipientCounts,
	renderMessage,
	sendToList,
	tokensFor,
} from "../mail";

const gameIdSchema = z.object({ gameId: z.string().min(1) });

const stageSchema = z.enum(
	STAGES.map((s) => s.key) as [StageKey, ...StageKey[]],
);

const messageSchema = z.object({
	subject: z.string().trim().min(1, "Subject?").max(120),
	body: z.string().trim().min(1, "Say something.").max(5000),
	/**
	 * Who hears it. "active" is everybody on the list; "everyone" also reaches
	 * the people who have stepped away, for the rare thing they would want
	 * anyway ("the season is moving to Thursdays"). Neither reaches anybody
	 * deactivated. The cycle emails never offer the choice.
	 */
	audience: z.enum(EMAIL_AUDIENCES).default("active"),
});

async function requireGame(db: Context["db"], id: string) {
	const found = await findGame(db, id);
	if (!found) {
		throw new ORPCError("NOT_FOUND", { message: "No such event." });
	}
	return found;
}

function nobody(): never {
	throw new ORPCError("BAD_REQUEST", { message: "Nobody is on the list." });
}

export const mailRouter = {
	/** Whether emails actually leave the building (BREVO_API_KEY is set). */
	status: adminProcedure.handler(async ({ context }) => ({
		dryRun: getMailer().dryRun,
		counts: await recipientCounts(context.db),
	})),

	/**
	 * What one stage of the cycle would say about a game right now, rendered
	 * against the live count. Nothing is sent and nothing is stamped.
	 */
	previewStage: adminProcedure
		.input(gameIdSchema.extend({ stage: stageSchema }))
		.handler(async ({ context, input }) => {
			const found = await requireGame(context.db, input.gameId);
			const split = await readSplit(context.db, found.id);
			const { rendered, audience } = renderStage({
				stage: input.stage,
				game: found,
				split,
				permitUrl: permitUrl(found),
				now: new Date(),
			});
			return {
				...rendered,
				stage: input.stage,
				recipientCount:
					audience === null
						? await countRecipients(context.db)
						: audience.length,
			};
		}),

	/**
	 * Send one stage by hand. The cycle does this on its own; this is for the
	 * times it should not have to wait -- a venue booked at four, or a resend to
	 * one person who says nothing arrived.
	 *
	 * With `personIds` it goes only to them and touches no stamp at all, so a
	 * resend cannot make the job think a stage is finished.
	 */
	sendStage: adminProcedure
		.input(
			gameIdSchema.extend({
				stage: stageSchema,
				personIds: z.array(z.string().min(1)).min(1).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const found = await requireGame(context.db, input.gameId);
			const split = await readSplit(context.db, found.id);
			const { rendered, audience } = renderStage({
				stage: input.stage,
				game: found,
				split,
				permitUrl: permitUrl(found),
				now: new Date(),
			});
			const result = await sendToList(context.db, {
				kind: STAGES.find((x) => x.key === input.stage)?.kind ?? "message",
				gameId: found.id,
				rendered,
				sentBy: context.session.user.id,
				onlyPersonIds: input.personIds ?? audience ?? undefined,
			});
			if (!result) nobody();
			if (!input.personIds && result.sent > 0) {
				// A real send by hand still counts as one for the spacing rule.
				await context.db
					.update(game)
					.set({ lastEmailAt: new Date() })
					.where(eq(game.id, found.id));
			}
			return result;
		}),

	/**
	 * Where every upcoming game stands in its cycle, for the admin table.
	 */
	cycle: adminProcedure.handler(async ({ context }) => {
		const { upcoming } = await listGames(context.db, 0);
		const sends = await context.db
			.select({
				gameId: emailSend.gameId,
				kind: emailSend.kind,
				failedCount: emailSend.failedCount,
				recipientCount: emailSend.recipientCount,
				createdAt: emailSend.createdAt,
			})
			.from(emailSend)
			.where(gte(emailSend.createdAt, new Date(Date.now() - 30 * 86400_000)))
			.orderBy(asc(emailSend.createdAt))
			.all();

		return Promise.all(
			upcoming.map(async (g) => {
				const split = await readSplit(context.db, g.id);
				return {
					gameId: g.id,
					dateLabel: g.dateLabel,
					timeLabel: g.timeLabel,
					gym: g.gym.name,
					status: g.status,
					cycle: g.cycle,
					counts: {
						in: split.yes,
						maybe: split.maybe,
						out: split.out,
						silent: split.silent,
					},
					stages: STAGES.map((stage) => {
						const sent = sends.filter(
							(x) => x.gameId === g.id && x.kind === stage.kind,
						);
						const last = sent[sent.length - 1];
						return {
							key: stage.key,
							num: stage.num,
							title: stage.title,
							doneAt: (g[stage.column] as Date | null)?.toISOString() ?? null,
							sentAt: last?.createdAt.toISOString() ?? null,
							recipients: last?.recipientCount ?? 0,
							failed: last?.failedCount ?? 0,
						};
					}),
				};
			}),
		);
	}),

	/**
	 * Overrule the verdict. The 7:30 count is the rule and this is the
	 * exception -- seven in and four maybes is a night a human might still
	 * want to play.
	 */
	callIt: adminProcedure
		.input(gameIdSchema.extend({ decision: z.enum(["on", "off"]) }))
		.handler(async ({ context, input }) => {
			const found = await requireGame(context.db, input.gameId);
			const split = await readSplit(context.db, found.id);
			const now = new Date();
			await context.db
				.update(game)
				.set({
					status: input.decision === "on" ? "confirmed" : "canceled",
					decidedAt: now,
					...(input.decision === "on" && found.confirmedAt === null
						? { confirmedAt: now }
						: {}),
					lastEmailAt: now,
				})
				.where(eq(game.id, found.id));

			const { rendered } = renderStage({
				stage: "final",
				game: {
					...found,
					status: input.decision === "on" ? "confirmed" : "canceled",
				},
				split,
				permitUrl: permitUrl(found),
				now,
				force: input.decision,
			});
			const result = await sendToList(context.db, {
				kind: "rsvp_final",
				gameId: found.id,
				rendered,
				sentBy: context.session.user.id,
				onlyPersonIds:
					input.decision === "on"
						? union(split.inIds, split.maybeIds)
						: union(
								split.inIds,
								split.maybeIds,
								split.silentIds,
								split.sponsorIds,
							),
			});
			return (
				result ?? {
					attempted: 0,
					sent: 0,
					failed: [],
					messageIds: [],
					sendId: null,
				}
			);
		}),

	previewMessage: adminProcedure
		.input(messageSchema)
		.handler(async ({ context, input }) => ({
			...renderMessage(input),
			recipientCount: await countRecipients(context.db, input.audience),
		})),

	/** Send an ad hoc message to the list, or only to yourself as a test. */
	sendMessage: adminProcedure
		.input(messageSchema.extend({ toSelf: z.boolean().default(false) }))
		.handler(async ({ context, input }) => {
			const rendered = renderMessage(input);
			if (input.toSelf) {
				const me = context.session.user;
				// The test copy has to render its links like the real thing. The
				// admin is a person like everybody else now, so their own tokens
				// are already sitting on their row.
				const { key, unsubscribeUrl } = await tokensFor(context.db, me.id);
				const outcome = await getMailer().sendOne(
					{ email: me.email, name: me.name },
					rendered,
					{
						tags: ["message", "test"],
						params: { name: me.name, unsubscribeUrl, key },
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
				sentBy: context.session.user.id,
				audience: input.audience,
			});
			if (!result) nobody();
			return result;
		}),

	/** The last few list sends, newest first. */
	recent: adminProcedure.handler(async ({ context }) => {
		const rows = await context.db
			.select()
			.from(emailSend)
			.orderBy(desc(emailSend.createdAt))
			.limit(20)
			.all();
		return rows.map((row) => ({
			...row,
			messageIds: JSON.parse(row.messageIds) as string[],
			errors: JSON.parse(row.errors) as { emails: string[]; error: string }[],
		}));
	}),
};
