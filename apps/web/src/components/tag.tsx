import { cn } from "@rsvp-site/ui/lib/utils";
import type { ReactNode } from "react";

/** The small outlined chip beside a name: "kid", or a group's tag. */
export function Tag({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"ml-2 rounded-full border border-line px-2 py-0.5 font-semibold text-[11px] text-haze",
				className,
			)}
		>
			{children}
		</span>
	);
}
