import type { Totals } from "@rsvp-site/api/headcount";
import { cn } from "@rsvp-site/ui/lib/utils";

/**
 * The stacked yes / maybe / no / waiting bar: lime, pink, muted, empty.
 * The same proportions everywhere -- card, guest list, invite page.
 */
export function ResponseBar({
	totals,
	className,
}: {
	totals: Pick<Totals, "yes" | "maybe" | "no" | "waiting">;
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
			aria-label={`${totals.yes} yes, ${totals.maybe} maybe, ${totals.no} can't, ${totals.waiting} waiting`}
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
	className,
}: {
	totals: Pick<Totals, "yes" | "maybe" | "no" | "waiting">;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-soft",
				className,
			)}
		>
			<span>
				<b className="text-lime-ink">{totals.yes}</b> in
			</span>
			<span>
				<b className="text-pink-ink">{totals.maybe}</b> maybe
			</span>
			{totals.no > 0 ? (
				<span>
					<b className="text-ink">{totals.no}</b> out
				</span>
			) : null}
			<span>
				<b className="text-ink">{totals.waiting}</b> waiting
			</span>
		</div>
	);
}

/** The small answer chip: YES, MAYBE, CAN'T, NO REPLY. */
export function AnswerTag({
	response,
}: {
	response: "yes" | "maybe" | "no" | null;
}) {
	const base =
		"inline-block flex-none rounded-full px-3 py-1 font-bold text-[12px] tracking-[0.04em]";
	if (response === "yes") {
		return <span className={cn(base, "bg-lime text-on-lime")}>YES</span>;
	}
	if (response === "maybe") {
		return <span className={cn(base, "bg-pink text-on-pink")}>MAYBE</span>;
	}
	if (response === "no") {
		return <span className={cn(base, "bg-line text-soft")}>CAN'T</span>;
	}
	return (
		<span className={cn(base, "border border-line-strong text-haze")}>
			NO REPLY
		</span>
	);
}
