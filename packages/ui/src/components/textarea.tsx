import { cn } from "@rsvp-site/ui/lib/utils";
import type * as React from "react";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"field-sizing-content flex min-h-20 w-full resize-none rounded-[14px] border border-line-strong bg-night px-4 py-3 text-[16px] text-ink leading-normal caret-lime outline-none transition-colors placeholder:text-haze/70 hover:border-haze focus-visible:border-lime disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
