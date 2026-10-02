/**
 * What the cycle should do about one game, right now. Pure: no database, no
 * mailer, no clock of its own -- which is the only reason the whole schedule
 * can be tested without standing up D1 and waiting for an event.
 */

import { CLOCK_STAGES, STAGE_COOLDOWN_MINUTES, type StageKey } from "../cycle";
import { addDays, runInstant } from "../run";

export type Stamps = Record<StageKey, Date | null>;

export type Plan = {
	/** Stages whose moment has passed unused. Resolve them, send nothing. */
	skip: StageKey[];
	/** The one stage to act on, if any. */
	run: StageKey | null;
	/** True when `run` must be recorded without emailing anybody. */
	silent: boolean;
	/** For the log. */
	reason: string;
};

/** When a clock stage falls for a given game date. */
export function stageInstant(
	key: StageKey,
	date: string,
	stages = CLOCK_STAGES,
): Date | null {
	const stage = stages.find((s) => s.key === key);
	if (!stage?.at) return null;
	return runInstant(addDays(date, stage.dayOffset), stage.at);
}

export type PlanInput = {
	date: string;
	startTime: string;
	stamps: Stamps;
	/** When a cycle email for this game last actually went out. */
	lastEmailAt: Date | null;
	now: Date;
};

/**
 * The rules, in order of who wins:
 *
 * R0  Past the start, nothing is emailed -- a cancellation at 9:05 reaches
 *     people already in the parking lot -- but the verdict is still recorded,
 *     so a dropped cron pass cannot leave a game undecided forever.
 *
 * R1  The opening call is never skipped, whatever time it is noticed. Stage
 *     one is not "the 5 PM email", it is "have these people been told this
 *     game exists". Running the prod first would email somebody "you have not
 *     answered" about a run nobody ever mentioned.
 *
 * R2  At most one clock stage per pass, and it is the LATEST one due. An
 *     overdue stage is abandoned, not delivered late: a 2 PM "you have not
 *     answered" landing at six, next to a six o'clock last call, is two
 *     emails saying the same thing badly.
 *
 * R3  Ninety minutes between actual sends -- except the verdict, which is the
 *     one email nobody may miss. A stage that turns out to send nothing
 *     neither waits for the cooldown nor consumes it.
 */
export function planStage(input: PlanInput): Plan {
	const { date, startTime, stamps, lastEmailAt, now } = input;
	const unresolved = (key: StageKey) => stamps[key] === null;

	// R0
	if (now.getTime() >= runInstant(date, startTime).getTime()) {
		const stale = CLOCK_STAGES.filter(
			(s) => s.key !== "final" && unresolved(s.key),
		).map((s) => s.key);
		return unresolved("final")
			? {
					skip: stale,
					run: "final",
					silent: true,
					reason: "Past the start: recording the verdict, emailing nobody.",
				}
			: { skip: stale, run: null, silent: false, reason: "Past the start." };
	}

	const due = CLOCK_STAGES.filter(
		(s) =>
			unresolved(s.key) &&
			(stageInstant(s.key, date)?.getTime() ?? Number.POSITIVE_INFINITY) <=
				now.getTime(),
	);
	if (due.length === 0) {
		return { skip: [], run: null, silent: false, reason: "Nothing due." };
	}

	// R1
	const call = due.find((s) => s.key === "call");
	if (call) {
		return {
			skip: [],
			run: "call",
			silent: false,
			reason: "The list has not been told this event exists.",
		};
	}

	// R2
	const chosen = due[due.length - 1];
	if (!chosen) {
		return { skip: [], run: null, silent: false, reason: "Nothing due." };
	}
	const skip = due.slice(0, -1).map((s) => s.key);

	// R3
	if (chosen.key !== "final" && lastEmailAt) {
		const since = now.getTime() - lastEmailAt.getTime();
		if (since < STAGE_COOLDOWN_MINUTES * 60_000) {
			return {
				skip: [],
				run: null,
				silent: false,
				reason: `Last email was ${Math.round(since / 60_000)} minutes ago; holding.`,
			};
		}
	}

	return {
		skip,
		run: chosen.key,
		silent: false,
		reason:
			skip.length > 0
				? `Running ${chosen.key}; ${skip.join(", ")} went by unused.`
				: `Running ${chosen.key}.`,
	};
}
