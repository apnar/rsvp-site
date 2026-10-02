import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@rsvp-site/ui/lib/utils";
import type * as React from "react";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<InputPrimitive
			type={type}
			data-slot="input"
			className={cn(
				"min-h-12 w-full min-w-0 rounded-[14px] border border-line-strong bg-night px-4 py-3 font-sans text-[16px] text-ink caret-lime outline-none transition-colors [color-scheme:dark] placeholder:text-haze/70 hover:border-haze focus-visible:border-lime focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-destructive",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
