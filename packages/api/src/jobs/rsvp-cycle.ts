/**
 * The RSVP cycle. Runs every half hour from the Cron Trigger and does exactly
 * what `../cycle.ts` says, which is also exactly what /admin/cycle tells
 * everybody it does.
 *
 * The half hour matters: the verdict falls at 7:30. Nothing else about the
 * schedule lives in wrangler.jsonc -- the job re-derives every instant from
 * `now` against the venue's clock, so the cron only has to be frequent enough,
 * never correct, and daylight saving never touches it.
 */

import { game } from "@rsvp-site/db/schema/game";
import { and, asc, eq, gte, isNull, lte, ne } from "drizzle-orm";

import { union } from "../audience";
import type { Context } from "../context";
import { CONFIRM_AT, PLAY_AT, STAGE, type StageKey } from "../cycle";
import { findGame, type GameSummary } from "../games";
import { recordInvites } from "../invites";
import { type ListSendResult, permitUrl, readSplit, sendToList } from "../mail";
import { addDays, todayInRunTimezone } from "../run";
import { planStage, type Stamps } from "./plan";
import { renderStage } from "./stage-render";

type Db = Context["db"];

export type StageOutcome = {
	gameId: string;
	stage: StageKey;
	sent: number;
	failed: number;
	/** Resolved without emailing: the condition was not met, or R0. */
	quiet?: string;
};

export type CycleRunResult = {
	skipped?: string;
	acted: StageOutcome[];
};

const stampsOf = (row: {
	callAt: Date | null;
	nudgeAt: Date | null;
	confirmedAt: Date | null;
	lastCallAt: Date | null;
	decidedAt: Date | null;
}): Stamps => ({
	call: row.callAt,
	nudge: row.nudgeAt,
	confirmed: row.confirmedAt,
	lastCall: row.lastCallAt,
	final: row.decidedAt,
});

/**
 * Claim a stage. The conditional update is the once-only lock, the same one
 * the old reminder job used: two overlapping runs cannot both see one change.
 * The status transition rides along in the same statement, so a game can
 * never be half-confirmed.
 */
async function claim(
	db: Db,
	gameId: string,
	stage: StageKey,
	now: Date,
	extra: { status?: "confirmed" | "canceled"; sending: boolean },
): Promise<boolean> {
	const column = STAGE[stage].column;
	const result = await db
		.update(game)
		.set({
			[column]: now,
			...(extra.status && { status: extra.status }),
			...(extra.sending && { lastEmailAt: now }),
		})
		.where(and(eq(game.id, gameId), isNull(game[column])))
		.run();
	return result.meta.changes === 1;
}

/** Give a stage back, so the next pass can try again. */
async function release(db: Db, gameId: string, stage: StageKey) {
	await db
		.update(game)
		.set({ [STAGE[stage].column]: null })
		.where(eq(game.id, gameId));
}

/** Mark a stage resolved without sending anything. */
async function skipStage(db: Db, gameId: string, stage: StageKey, now: Date) {
	await claim(db, gameId, stage, now, { sending: false });
}

/**
 * The tenth yes turns the lights on, whatever time it lands.
 *
 * Called from the cron (which makes it correct on its own, and self-healing
 * within half an hour) and from every RSVP mutation (which only makes it
 * quick). The conditional claim is what lets both exist without a chance of
 * two "game on" emails.
 */
export async function confirmIfReady(
	db: Db,
	gameId: string,
	now: Date = new Date(),
): Promise<StageOutcome | null> {
	const row = await db
		.select({
			id: game.id,
			status: game.status,
			callAt: game.callAt,
			confirmedAt: game.confirmedAt,
		})
		.from(game)
		.where(eq(game.id, gameId))
		.get();
	if (!row) return null;
	if (row.confirmedAt !== null) return null;
	if (row.status === "canceled") return null;
	// Never announce a run the list has not been told about. A game booked
	// three weeks out that ten regulars sign up for on the site should not
	// fire "the event is on" before the invitation.
	if (row.callAt === null) return null;

	const summary = await findGame(db, gameId);
	if (!summary) return null;

	const split = await readSplit(db, gameId);
	if (split.yes < CONFIRM_AT) return null;

	if (
		!(await claim(db, gameId, "confirmed", now, {
			status: "confirmed",
			sending: true,
		}))
	) {
		return null;
	}

	const { rendered, audience } = renderStage({
		stage: "confirmed",
		game: summary,
		split,
		permitUrl: permitUrl(summary),
		now,
	});
	return finish(db, gameId, "confirmed", rendered, {
		onlyPersonIds: audience ?? undefined,
	});
}

/** Send, record, and hand back the outcome. Releases the lock on a throw. */
async function finish(
	db: Db,
	gameId: string,
	stage: StageKey,
	rendered: { subject: string; html: string; text: string },
	opts: { onlyPersonIds?: string[] },
): Promise<StageOutcome> {
	let result: ListSendResult | null;
	try {
		result = await sendToList(db, {
			kind: STAGE[stage].kind,
			gameId,
			rendered,
			audience: "active",
			onlyPersonIds: opts.onlyPersonIds,
		});
	} catch (error) {
		await release(db, gameId, stage);
		throw error;
	}
	// Nobody to tell is a resolved stage, not a failed one: keep the stamp or
	// the job retries it every half hour until midnight.
	if (!result) {
		return { gameId, stage, sent: 0, failed: 0, quiet: "Nobody to tell." };
	}
	// Every batch rejected: give it back and try on the next pass.
	if (result.sent === 0) await release(db, gameId, stage);
	return {
		gameId,
		stage,
		sent: result.sent,
		failed: result.attempted - result.sent,
	};
}

/**
 * Run one stage for one game. Reads and decides before claiming, so a stage
 * that turns out to have nothing to say is never recorded as an email.
 */
async function runStage(
	db: Db,
	summary: GameSummary,
	stage: StageKey,
	now: Date,
	silent: boolean,
): Promise<StageOutcome | null> {
	const split = await readSplit(db, summary.id);
	const short = split.yes < CONFIRM_AT;

	if (stage === "final") {
		const on = split.yes >= PLAY_AT;
		// Already on and still on: the answer has not changed, so nobody needs
		// a second email saying so. The decision is recorded either way.
		const quiet = silent || (on && summary.status === "confirmed");
		if (
			!(await claim(db, summary.id, "final", now, {
				status: on ? "confirmed" : "canceled",
				sending: !quiet,
			}))
		) {
			return null;
		}
		if (quiet) {
			return {
				gameId: summary.id,
				stage,
				sent: 0,
				failed: 0,
				quiet: silent
					? "Past the start; recorded only."
					: "Already on and still on.",
			};
		}
		const { rendered, audience } = renderStage({
			stage: "final",
			game: summary,
			split,
			permitUrl: permitUrl(summary),
			now,
			force: on ? "on" : "off",
		});
		return finish(db, summary.id, "final", rendered, {
			onlyPersonIds: audience ?? undefined,
		});
	}

	if (silent) {
		await skipStage(db, summary.id, stage, now);
		return {
			gameId: summary.id,
			stage,
			sent: 0,
			failed: 0,
			quiet: "Too late.",
		};
	}

	if (stage === "call") {
		const alreadyOn = !short;
		if (
			!(await claim(db, summary.id, "call", now, {
				// Ten before we even asked: this one email does both jobs.
				...(alreadyOn && { status: "confirmed" as const }),
				sending: true,
			}))
		) {
			return null;
		}
		if (alreadyOn) {
			await db
				.update(game)
				.set({ confirmedAt: now })
				.where(and(eq(game.id, summary.id), isNull(game.confirmedAt)));
		}
		// Write down who is being asked, before the asking. This snapshot is
		// the only record that survives of who was on the roster tonight and
		// who was away -- `user` keeps one status and no history -- and the
		// response rates on /admin/users are counted against it.
		await recordInvites(db, summary.id, now);
		const { rendered } = renderStage({
			stage: "call",
			game: summary,
			split,
			permitUrl: permitUrl(summary),
			now,
		});
		return finish(db, summary.id, "call", rendered, {});
	}

	if (stage === "nudge") {
		if (!short || split.silentIds.length === 0) {
			await skipStage(db, summary.id, stage, now);
			return {
				gameId: summary.id,
				stage,
				sent: 0,
				failed: 0,
				quiet: short ? "Everybody answered." : "Already have enough.",
			};
		}
		if (!(await claim(db, summary.id, stage, now, { sending: true }))) {
			return null;
		}
		const { rendered } = renderStage({
			stage: "nudge",
			game: summary,
			split,
			permitUrl: null,
			now,
		});
		return finish(db, summary.id, stage, rendered, {
			onlyPersonIds: split.silentIds,
		});
	}

	// lastCall
	const audience = union(split.silentIds, split.maybeIds);
	if (!short || audience.length === 0) {
		await skipStage(db, summary.id, stage, now);
		return {
			gameId: summary.id,
			stage,
			sent: 0,
			failed: 0,
			quiet: short ? "Nobody left to ask." : "Already have enough.",
		};
	}
	if (!(await claim(db, summary.id, stage, now, { sending: true })))
		return null;
	const { rendered } = renderStage({
		stage: "lastCall",
		game: summary,
		split,
		permitUrl: null,
		now,
	});
	return finish(db, summary.id, stage, rendered, { onlyPersonIds: audience });
}

/**
 * One pass. Every game whose cycle could still be running is today's or
 * tomorrow's -- the earliest stage is five o'clock the evening before.
 */
export async function runRsvpCycle(
	db: Db,
	now: Date = new Date(),
): Promise<CycleRunResult> {
	const today = todayInRunTimezone(now);
	const rows = await db
		.select({
			id: game.id,
			date: game.date,
			startTime: game.startTime,
			status: game.status,
			callAt: game.callAt,
			nudgeAt: game.nudgeAt,
			confirmedAt: game.confirmedAt,
			lastCallAt: game.lastCallAt,
			decidedAt: game.decidedAt,
			lastEmailAt: game.lastEmailAt,
		})
		.from(game)
		.where(
			and(
				gte(game.date, today),
				lte(game.date, addDays(today, 1)),
				ne(game.status, "canceled"),
			),
		)
		.orderBy(asc(game.date), asc(game.startTime))
		.all();

	if (rows.length === 0) {
		return { skipped: "Nothing booked for tonight or tomorrow.", acted: [] };
	}

	const acted: StageOutcome[] = [];
	// Serially: two games in one window is already a pathology, and this keeps
	// two Brevo blasts from interleaving in the log.
	for (const row of rows) {
		const plan = planStage({
			date: row.date,
			startTime: row.startTime,
			stamps: stampsOf(row),
			lastEmailAt: row.lastEmailAt,
			now,
		});
		for (const stage of plan.skip) {
			await skipStage(db, row.id, stage, now);
		}
		if (plan.run) {
			const summary = await findGame(db, row.id);
			if (summary) {
				const outcome = await runStage(db, summary, plan.run, now, plan.silent);
				if (outcome) acted.push(outcome);
			}
		}
		// The tenth yes may have landed between passes without anybody
		// touching the site since. This is the backstop for that.
		const confirmed = await confirmIfReady(db, row.id, now);
		if (confirmed) acted.push(confirmed);
	}
	return { acted };
}
