import { cn } from "@rsvp-site/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * A big number over a small label, on a panel. `compact` is the same pair
 * with no panel of its own, for a row of them inside one.
 */
export function StatTile({
	value,
	label,
	tone = "ink",
	compact = false,
	className,
}: {
	value: ReactNode;
	label: ReactNode;
	tone?: "ink" | "lime" | "pink" | "haze";
	compact?: boolean;
	className?: string;
}) {
	return (
		<div
			className={cn(!compact && "rounded-[20px] bg-panel p-[18px]", className)}
		>
			<div
				className={cn(
					"numeral",
					compact ? "text-[28px]" : "text-[40px]",
					tone === "lime" && "text-lime-ink",
					tone === "pink" && "text-pink-ink",
					tone === "haze" && "text-haze",
				)}
			>
				{value}
			</div>
			<div
				className={cn(
					compact ? "text-[13px] text-haze" : "mt-1.5 text-[14px] text-soft",
				)}
			>
				{label}
			</div>
		</div>
	);
}
