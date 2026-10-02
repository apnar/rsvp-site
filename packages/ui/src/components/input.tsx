import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@rsvp-site/ui/lib/utils";
import type * as React from "react";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<InputPrimitive
			type={type}
			data-slot="input"
			className={cn(
				"min-h-9 w-full min-w-0 rounded-none border border-divider bg-surface px-2.5 py-1.5 font-sans text-ink text-sm caret-steel outline-none transition-colors placeholder:text-neutral-600 hover:border-ink/45 focus-visible:border-steel focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-destructive",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
