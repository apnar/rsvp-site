import { cn } from "@rsvp-site/ui/lib/utils";
import type { ComponentProps } from "react";

/** A native select dressed as a pill, so it keeps the platform's picker. */
export function NativeSelect({
	className,
	...props
}: ComponentProps<"select">) {
	return (
		<select
			className={cn(
				"min-h-10 cursor-pointer rounded-full border border-line-strong bg-night px-3 py-2 text-[14px] text-ink hover:border-haze focus-visible:border-lime",
				className,
			)}
			{...props}
		/>
	);
}
