import { cn } from "@rsvp-site/ui/lib/utils";
import type { ReactNode } from "react";

/** A big number over a small label, on a panel. */
export function StatTile({
	value,
	label,
	tone = "ink",
	className,
}: {
	value: ReactNode;
	label: ReactNode;
	tone?: "ink" | "lime" | "pink" | "haze";
	className?: string;
}) {
	return (
		<div className={cn("rounded-[20px] bg-panel p-[18px]", className)}>
			<div
				className={cn(
					"numeral text-[40px]",
					tone === "lime" && "text-lime-ink",
					tone === "pink" && "text-pink-ink",
					tone === "haze" && "text-haze",
				)}
			>
				{value}
			</div>
			<div className="mt-1.5 text-[14px] text-soft">{label}</div>
		</div>
	);
}
