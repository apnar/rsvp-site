import type { Headcount } from "@rsvp-site/api/routers/rsvp";

import {
	announceRemaining,
	formatRemaining,
	useClock,
} from "@/hooks/use-countdown";
import { headline, subline } from "@/lib/rsvp";

/**
 * Where the drive stands and when it stops. Rendered on the board and on the
 * page a cycle email lands on, because "did that work" is exactly the
 * question somebody has after tapping a button in an email.
 */

function stageAt(headcount: Headcount, key: string): string | null {
	return headcount.game.cycle.stages.find((s) => s.key === key)?.at ?? null;
}

/** Every timestamp on this page is the venue's clock, never the browser's. */
const RUN_TZ = "America/New_York";

export function clockLabel(at: string | Date): string {
	return new Date(at).toLocaleTimeString("en-US", {
		timeZone: RUN_TZ,
		hour: "numeric",
		minute: "2-digit",
	});
}

function Verdict({ headcount }: { headcount: Headcount }) {
	const { game, counts } = headcount;
	if (game.status === "confirmed" && game.decidedAt) {
		return (
			<div className="mb-6 flex flex-wrap items-baseline justify-between gap-3 bg-steel px-5 py-3 text-ground">
				<span className="font-heading text-[28px] uppercase leading-none tracking-[0.02em]">
					It's on
				</span>
				<span className="kicker tnum">
					Called {clockLabel(game.decidedAt)} · {counts.in} in
				</span>
			</div>
		);
	}
	if (game.status === "canceled") {
		return (
			<div className="mb-6 flex flex-wrap items-baseline justify-between gap-3 border border-destructive/40 px-5 py-3 text-destructive">
				<span className="font-heading text-[28px] uppercase leading-none tracking-[0.02em]">
					Called off
				</span>
				<span className="kicker tnum">
					{game.decidedAt ? clockLabel(game.decidedAt) : "Tonight"} ·{" "}
					{counts.in} in
				</span>
			</div>
		);
	}
	return null;
}

function Countdown({ headcount }: { headcount: Headcount }) {
	const { game } = headcount;
	const finalAt = stageAt(headcount, "final");
	// Once it is on, counting down to a decision already made reads as though
	// the event might still fall over. Point at the start instead. Once it is
	// off, there is nothing left to count toward at all.
	const on = game.status === "confirmed";
	const target =
		game.status === "canceled" ? null : on ? game.cycle.startsAt : finalAt;
	const what = on ? "the start" : "the final call";
	// Hooks run before the early return, always.
	const now = useClock(headcount.now, target);

	if (!target) return null;
	const remaining = Date.parse(target) - now;

	if (remaining <= 0) {
		if (on) return null;
		return (
			<div role="timer" className="mt-6">
				<span className="kicker block text-steel-700">Final call</span>
				<span className="block font-heading font-semibold text-[26px] leading-none">
					Passed. The verdict is landing.
				</span>
			</div>
		);
	}

	// More than six hours out, a ticking clock is just noise.
	const coarse = remaining > 6 * 60 * 60 * 1000;
	return (
		<div role="timer" className="mt-6">
			<span className="kicker block text-steel-700">
				{on ? "Starts" : "Final call"}
			</span>
			<span
				aria-hidden="true"
				className="tnum block font-heading font-semibold text-[40px] leading-none"
			>
				{coarse ? clockLabel(target) : formatRemaining(remaining)}
			</span>
			{coarse && !on ? (
				<span
					aria-hidden="true"
					className="mt-1 block text-[13px] text-neutral-700"
				>
					{headcount.playAt} in or it is off
				</span>
			) : null}
			<span className="sr-only" aria-live="polite">
				{announceRemaining(remaining, what)}
			</span>
		</div>
	);
}

export function RsvpStatus({ headcount }: { headcount: Headcount }) {
	const { counts, capacity, confirmAt, playAt, game, silentNames } = headcount;
	const limits = { confirmAt, playAt, capacity };
	const pct = (n: number) => `${Math.min(100, (n / capacity) * 100)}%`;
	// Maybes ride on top of the ins, and neither can push the bar past the end.
	const maybeWidth = Math.max(0, Math.min(counts.maybe, capacity - counts.in));

	return (
		<div>
			<Verdict headcount={headcount} />

			<h2 className="font-heading text-[32px] uppercase leading-9 tracking-[0.02em]">
				{headline(counts, limits, game.status, Boolean(game.decidedAt))}
			</h2>
			<p className="mt-4 max-w-[48ch] text-[15px] text-neutral-700 leading-6">
				{subline(counts, limits, game.status)}
			</p>

			<div className="mt-6 grid grid-cols-4 border border-divider">
				{(
					[
						["In", counts.in],
						["Maybe", counts.maybe],
						["Out", counts.out],
						["Silent", counts.silent],
					] as const
				).map(([label, n]) => (
					<div
						key={label}
						className="border-divider border-l px-3 py-2 first:border-l-0"
					>
						<span className="tnum block font-heading font-semibold text-[28px] leading-none">
							{n}
						</span>
						<span className="kicker mt-1 block text-[11px] text-neutral-700">
							{label}
						</span>
					</div>
				))}
			</div>

			{/*
			 * A ruler rather than a percentage: solid for the ins, hatched for
			 * the maybes, with registration ticks where the two numbers that
			 * matter fall. The whole graphic is hidden from screen readers and
			 * carried by the sentence underneath.
			 */}
			<div className="kicker tnum mt-6 mb-2 flex justify-between">
				<span>
					{counts.in} in{counts.maybe ? ` · ${counts.maybe} maybe` : ""}
				</span>
				<span className="text-neutral-700">{capacity} spots</span>
			</div>
			<div className="relative h-3 border border-divider" aria-hidden="true">
				<div
					className="absolute inset-y-0 left-0 bg-steel motion-safe:transition-[width]"
					style={{ width: pct(counts.in) }}
				/>
				<div
					className="hatch absolute inset-y-0 motion-safe:transition-[left,width]"
					style={{ left: pct(counts.in), width: pct(maybeWidth) }}
				/>
				<span
					className="absolute inset-y-[-4px] w-px bg-ink/60"
					style={{ left: pct(playAt) }}
				/>
				<span
					className="absolute inset-y-[-4px] w-px bg-ink/60"
					style={{ left: pct(confirmAt) }}
				/>
			</div>
			<div
				className="kicker tnum relative mt-1.5 h-4 text-[11px] text-neutral-700"
				aria-hidden="true"
			>
				<span
					className="absolute -translate-x-1/2"
					style={{ left: pct(playAt) }}
				>
					{playAt} min
				</span>
				<span
					className="absolute -translate-x-1/2"
					style={{ left: pct(confirmAt) }}
				>
					{confirmAt} on
				</span>
			</div>
			<p className="sr-only">
				{counts.in} in, {counts.maybe} maybe, {counts.out} out, {counts.silent}{" "}
				yet to answer. {playAt} needed to go ahead, {confirmAt} to confirm,{" "}
				{capacity} spots.
			</p>

			<Countdown headcount={headcount} />

			{silentNames.length > 0 ? (
				<p className="mt-5 max-w-[52ch] text-[13px] text-neutral-700 leading-5">
					<span className="kicker mr-2 text-steel-700">Not a word from</span>
					{silentNames.join(", ")}.
				</p>
			) : null}
		</div>
	);
}
