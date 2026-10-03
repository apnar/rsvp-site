import type { DesignTheme as Theme } from "@rsvp-site/design/schema";
import { cn } from "@rsvp-site/ui/lib/utils";
import type { ReactNode } from "react";

import { Cover } from "./cover";
import { DesignTheme } from "./design/design-theme";

/**
 * The top of an invitation: the cover (or the host's own theme), a header
 * row, the status chip, the title and the facts. The signed-in page and the
 * share-link teaser both open with it; `size` is how tall it is, and
 * `centered` stacks a designed card above the text, the signed-in page's
 * way of showing one. The teaser instead gives its card picture as `card`.
 */
export function EventHero({
	header,
	coverKey,
	theme,
	card,
	centered = false,
	size,
	tone,
	status,
	title,
	dateLabel,
	timeLabel,
	location,
	hostLine,
	children,
}: {
	header: ReactNode;
	coverKey: string | null;
	/** The event's own look, when it has designed one. */
	theme?: Theme | null;
	card?: ReactNode;
	centered?: boolean;
	size: "page" | "teaser";
	tone: "lime" | "pink" | "ink";
	status: string;
	title: string;
	dateLabel?: string | null;
	timeLabel?: string | null;
	location?: string | null;
	hostLine?: string | null;
	children?: ReactNode;
}) {
	const stacked = !!theme && centered;
	const chip = (align: string) => (
		<span
			className={cn(
				align,
				"rounded-full px-3.5 py-1.5 font-bold text-[13px] uppercase tracking-[0.08em]",
				tone === "ink"
					? "bg-ink text-on-ink"
					: tone === "lime"
						? "bg-lime text-on-lime"
						: "bg-pink text-on-pink",
			)}
		>
			{status}
		</span>
	);
	const facts = (align?: string) => (
		<div
			className={cn(
				"flex flex-wrap gap-x-7 gap-y-2 font-medium text-[17px]",
				align,
			)}
		>
			{dateLabel ? <span>{dateLabel}</span> : null}
			{timeLabel ? <span className="text-lime-ink">{timeLabel}</span> : null}
			{location ? <span>{location}</span> : null}
			{hostLine ? (
				<span className="text-haze">Hosted by {hostLine}</span>
			) : null}
		</div>
	);

	return (
		<section
			className={cn(
				"relative flex flex-col",
				!stacked &&
					cn(
						"overflow-hidden",
						size === "page" ? "min-h-[min(86vh,760px)]" : "min-h-svh",
					),
			)}
		>
			{theme ? (
				<DesignTheme theme={theme} />
			) : (
				<>
					<div className="absolute inset-0">
						<Cover coverKey={coverKey} />
					</div>
					<div
						className={cn(
							"pointer-events-none absolute inset-0",
							size === "page"
								? "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-night)_55%,transparent)_0%,color-mix(in_oklab,var(--color-night)_20%,transparent)_40%,var(--color-night)_100%)]"
								: "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-night)_55%,transparent)_0%,color-mix(in_oklab,var(--color-night)_30%,transparent)_35%,var(--color-night)_85%)]",
						)}
					/>
				</>
			)}
			{header}
			{stacked ? (
				<div className="mx-auto flex w-full max-w-[1180px] flex-col items-center gap-5 px-[clamp(16px,4vw,40px)] pt-2 pb-9 text-center">
					{card}
					<h1 className="sr-only">{title}</h1>
					{chip("self-center")}
					{facts("justify-center")}
				</div>
			) : (
				<>
					{card ? (
						<div className="relative mx-auto w-full max-w-[1180px] px-[clamp(16px,4vw,40px)] pb-6">
							{card}
						</div>
					) : null}
					<div
						className={cn(
							"relative mx-auto mt-auto flex w-full max-w-[1180px] flex-col gap-[18px] px-[clamp(16px,4vw,40px)]",
							size === "page" ? "pb-9" : "pb-[clamp(32px,6vw,72px)]",
						)}
					>
						{chip("self-start")}
						<h1 className="m-0 max-w-[14ch] font-black text-[clamp(40px,7.4vw,96px)] leading-[0.95] tracking-[-0.04em]">
							{title}
						</h1>
						{facts()}
						{children}
					</div>
				</>
			)}
		</section>
	);
}
