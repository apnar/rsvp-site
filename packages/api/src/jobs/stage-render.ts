/**
 * One stage of the cycle, rendered. Shared so the admin preview shows exactly
 * the email the job would send, down to who would get it -- a preview that
 * renders through a second code path is a preview of nothing.
 */

import type { Rendered } from "@rsvp-site/email";
import {
	rsvpCallEmail,
	rsvpConfirmedEmail,
	rsvpFinalEmail,
	rsvpLastCallEmail,
	rsvpNudgeEmail,
} from "@rsvp-site/email";

import { type Split, union } from "../audience";
import { CONFIRM_AT, PLAY_AT, type StageKey } from "../cycle";
import type { GameSummary } from "../games";
import { rsvpFacts } from "../mail";
import { todayInRunTimezone } from "../run";

export type StageRender = {
	rendered: Rendered;
	/** Who it goes to, or null for "everybody active". */
	audience: string[] | null;
};

export function renderStage(input: {
	stage: StageKey;
	game: GameSummary;
	split: Split;
	permitUrl: string | null;
	now: Date;
	/** Preview or override a verdict rather than deriving it from the count. */
	force?: "on" | "off";
}): StageRender {
	const { stage, game, split, now } = input;
	const facts = rsvpFacts(game, split);
	const needed = Math.max(0, CONFIRM_AT - split.yes);

	switch (stage) {
		case "call":
			return {
				rendered: rsvpCallEmail({
					...facts,
					today: game.date === todayInRunTimezone(now),
					alreadyOn: split.yes >= CONFIRM_AT,
				}),
				audience: null,
			};
		case "nudge":
			return {
				rendered: rsvpNudgeEmail({ ...facts, needed }),
				audience: split.silentIds,
			};
		case "confirmed":
			return {
				rendered: rsvpConfirmedEmail({
					...facts,
					permitUrl: input.permitUrl,
				}),
				audience: union(split.inIds, split.maybeIds),
			};
		case "lastCall":
			return {
				rendered: rsvpLastCallEmail({
					...facts,
					needed,
					wasConfirmed: game.status === "confirmed",
				}),
				audience: union(split.silentIds, split.maybeIds),
			};
		default: {
			const on = input.force ? input.force === "on" : split.yes >= PLAY_AT;
			return {
				rendered: rsvpFinalEmail({
					...facts,
					decision: on ? "on" : "off",
					permitUrl: input.permitUrl,
				}),
				// A cancellation goes wider than anything else in the cycle:
				// whoever ignored every email is the one who drives to a
				// locked venue out of habit, and a guest has no inbox at all.
				audience: on
					? union(split.inIds, split.maybeIds)
					: union(
							split.inIds,
							split.maybeIds,
							split.silentIds,
							split.sponsorIds,
						),
			};
		}
	}
}
