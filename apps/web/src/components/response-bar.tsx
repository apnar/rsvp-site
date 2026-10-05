import {
	type AnswerSet,
	type AnswerWords,
	pickWord,
	showsMaybe,
} from "@rsvp-site/api/answer-words";
import type { Answer, Totals } from "@rsvp-site/api/headcount";
import { cn } from "@rsvp-site/ui/lib/utils";

type Counts = Pick<Totals, "yes" | "maybe" | "no" | "waiting">;

/**
 * The stacked yes / maybe / no / waiting bar: lime, pink, muted, empty.
 * The same proportions everywhere -- card, guest list, invite page.
 */
export function ResponseBar({
	totals,
	words,
	className,
}: {
	totals: Counts;
	words: AnswerWords;
	className?: string;
}) {
	const empty = totals.yes + totals.maybe + totals.no + totals.waiting === 0;
	return (
		<div
			className={cn(
				"flex h-2.5 overflow-hidden rounded-full bg-night",
				className,
			)}
			role="img"
			aria-label={`${totals.yes} ${words.yes.count}, ${totals.maybe} ${words.maybe.count}, ${totals.no} ${words.no.count}, ${totals.waiting} ${words.none.count}`}
		>
			{empty ? null : (
				<>
					<span style={{ flex: totals.yes }} className="bg-lime" />
					<span style={{ flex: totals.maybe }} className="bg-pink" />
					<span style={{ flex: totals.no }} className="bg-line-strong" />
					<span style={{ flex: totals.waiting }} />
				</>
			)}
		</div>
	);
}

/** "42 in · 9 maybe · 6 out · 14 waiting", with the numbers colored. */
export function ResponseCounts({
	totals,
	answers,
	className,
	alwaysShowOut = false,
}: {
	totals: Counts;
	answers: AnswerSet;
	className?: string;
	/** The invite page lists all four; a card drops "out" while it is zero. */
	alwaysShowOut?: boolean;
}) {
	const { words } = answers;
	return (
		<div
			className={cn(
				"flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-soft",
				className,
			)}
		>
			<span>
				<b className="text-lime-ink">{totals.yes}</b> {words.yes.count}
			</span>
			{showsMaybe(answers, totals.maybe) ? (
				<span>
					<b className="text-pink-ink">{totals.maybe}</b> {words.maybe.count}
				</span>
			) : null}
			{totals.no > 0 || alwaysShowOut ? (
				<span>
					<b className="text-ink">{totals.no}</b> {words.no.count}
				</span>
			) : null}
			<span>
				<b className="text-ink">{totals.waiting}</b> {words.none.count}
			</span>
		</div>
	);
}

const TAG_LOOK: Record<Answer | "none", string> = {
	yes: "bg-lime text-on-lime",
	maybe: "bg-pink text-on-pink",
	no: "bg-line text-soft",
	none: "border border-line-strong text-haze",
};

/** The small answer chip, in the event's words: YES, MAYBE, CAN'T, NO REPLY. */
export function AnswerTag({
	response,
	words,
}: {
	response: Answer | null;
	words: AnswerWords;
}) {
	return (
		<span
			className={cn(
				"inline-block flex-none rounded-full px-3 py-1 font-bold text-[12px] uppercase tracking-[0.04em]",
				TAG_LOOK[response ?? "none"],
			)}
		>
			{pickWord(words, response)}
		</span>
	);
}
