import type { Totals } from "@rsvp-site/api/headcount";
import { daysBetween } from "@rsvp-site/api/time";
import { cn } from "@rsvp-site/ui/lib/utils";
import type { ReactNode } from "react";

import { inDays } from "@/lib/format";

import { Cover } from "./cover";
import { ResponseBar, ResponseCounts } from "./response-bar";

export type CardEvent = {
	id: string;
	title: string;
	status: "draft" | "published" | "canceled";
	date: string | null;
	dateLabel: string | null;
	timeLabel: string | null;
	coverKey: string | null;
	totals: Totals;
};

/** "Sat, Oct 24 · 5:00 PM" -- the start only, as the design shows it. */
export function whenShort(e: Pick<CardEvent, "dateLabel" | "timeLabel">) {
	const start = e.timeLabel?.split(" - ")[0];
	return [e.dateLabel, start].filter(Boolean).join(" · ") || "No date yet";
}

/**
 * One event on a dashboard: cover with a badge, date, title, the response
 * bar and two actions. `actions` is whatever the page wants at the bottom.
 */
export function EventCard({
	event,
	today,
	actions,
	badge,
}: {
	event: CardEvent;
	today: string;
	actions: ReactNode;
	badge?: { label: string; tone: "lime" | "pink" | "ink" };
}) {
	const days = event.date ? daysBetween(today, event.date) : null;
	const chip =
		badge ??
		(event.status === "canceled"
			? { label: "Canceled", tone: "ink" as const }
			: days !== null
				? {
						label: inDays(days),
						tone: days <= 7 ? ("lime" as const) : ("ink" as const),
					}
				: null);
	return (
		<article className="flex flex-col overflow-hidden rounded-[26px] border border-line bg-panel">
			<div className="relative aspect-[16/10]">
				<Cover coverKey={event.coverKey} />
				{chip ? (
					<span
						className={cn(
							"pointer-events-none absolute top-3.5 left-3.5 rounded-full px-3 py-1.5 font-bold text-[12px] text-night uppercase tracking-[0.06em]",
							chip.tone === "lime" && "bg-lime",
							chip.tone === "pink" && "bg-pink",
							chip.tone === "ink" && "bg-ink",
						)}
					>
						{chip.label}
					</span>
				) : null}
			</div>
			<div className="flex flex-1 flex-col gap-3.5 px-5 pt-[18px] pb-5">
				<div>
					<span className="font-bold text-[14px] text-lime">
						{whenShort(event)}
					</span>
					<h3 className="mt-1.5 mb-0 text-[22px] leading-[1.1]">
						{event.title}
					</h3>
				</div>
				<ResponseBar totals={event.totals} />
				<ResponseCounts totals={event.totals} />
				<div className="mt-auto flex gap-2">{actions}</div>
			</div>
		</article>
	);
}
