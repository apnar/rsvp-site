import type { AnswerSet } from "@rsvp-site/api/answer-words";
import type { Totals } from "@rsvp-site/api/headcount";
import { daysBetween, formatTime } from "@rsvp-site/api/time";
import { cn } from "@rsvp-site/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { designSrc } from "@/lib/design-src";
import { inDays } from "@/lib/format";

import { Cover } from "./cover";
import { ResponseBar, ResponseCounts } from "./response-bar";

type CardEvent = {
	id: string;
	title: string;
	status: "draft" | "published" | "canceled";
	date: string | null;
	dateLabel: string | null;
	startTime: string | null;
	coverKey: string | null;
	/** The designed card's picture and its page colour, when the design is on. */
	card?: { key: string; bg: string } | null;
	totals: Totals;
	answers: AnswerSet;
};

/** "Sat, Oct 24 · 5:00 PM" -- the start only, as the design shows it. */
function whenShort(e: Pick<CardEvent, "dateLabel" | "startTime">) {
	const start = e.startTime ? formatTime(e.startTime) : null;
	return [e.dateLabel, start].filter(Boolean).join(" · ") || "No date yet";
}

/**
 * One event on a dashboard: cover with a badge, date, title, the response
 * bar and its actions. `actions` is whatever the page wants at the bottom.
 *
 * The whole card opens the event -- a draft opens in the editor, since
 * there is nothing to see yet. The title is the one real link, stretched
 * over the card, so it reads as a link to a screen reader once rather than
 * as a card-sized blob; the action buttons sit above it and keep working.
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
		<article className="group relative flex flex-col overflow-hidden rounded-[26px] border border-line bg-panel transition-colors hover:border-line-strong">
			<div className="relative aspect-[16/10]">
				{event.card ? (
					<div
						className="flex size-full items-center justify-center p-3"
						style={{ background: event.card.bg }}
					>
						<img
							src={designSrc(event.card.key)}
							alt=""
							loading="lazy"
							className="block h-full w-auto max-w-full rounded-[4px] object-contain shadow-float"
						/>
					</div>
				) : (
					<Cover coverKey={event.coverKey} />
				)}
				{chip ? (
					<span
						className={cn(
							"pointer-events-none absolute top-3.5 left-3.5 rounded-full px-3 py-1.5 font-bold text-[12px] uppercase tracking-[0.06em]",
							chip.tone === "lime" && "bg-lime text-on-lime",
							chip.tone === "pink" && "bg-pink text-on-pink",
							chip.tone === "ink" && "bg-ink text-on-ink",
						)}
					>
						{chip.label}
					</span>
				) : null}
			</div>
			<div className="flex flex-1 flex-col gap-3.5 px-5 pt-[18px] pb-5">
				<div>
					<span className="font-bold text-[14px] text-lime-ink">
						{whenShort(event)}
					</span>
					<h3 className="mt-1.5 mb-0 text-[22px] leading-[1.1]">
						<Link
							to={event.status === "draft" ? "/e/$eventId/edit" : "/e/$eventId"}
							params={{ eventId: event.id }}
							className="text-ink no-underline after:absolute after:inset-0 after:content-[''] hover:text-ink group-hover:underline"
						>
							{event.title}
						</Link>
					</h3>
				</div>
				<ResponseBar totals={event.totals} words={event.answers.words} />
				<ResponseCounts totals={event.totals} answers={event.answers} />
				<div className="relative z-10 mt-auto flex flex-wrap gap-2">
					{actions}
				</div>
			</div>
		</article>
	);
}
