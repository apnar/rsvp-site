import { cn } from "@rsvp-site/ui/lib/utils";

/** "botch•rsvp", with the lime dot. */
export function Wordmark({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				"font-black font-heading text-[20px] text-ink tracking-[-0.02em]",
				className,
			)}
		>
			botch<span className="text-lime-ink">•</span>rsvp
		</span>
	);
}

/** The round initials badge the design uses for people. */
export function Avatar({
	initials,
	tone = "plain",
	className,
}: {
	initials: string;
	tone?: "pink" | "plain" | "outline" | "dim";
	className?: string;
}) {
	return (
		<span
			aria-hidden
			className={cn(
				"grid size-11 flex-none place-items-center rounded-full font-bold text-sm",
				tone === "pink" && "bg-pink text-on-pink",
				tone === "plain" && "bg-panel-2 text-ink",
				tone === "outline" && "border border-line-strong text-haze",
				tone === "dim" &&
					"bg-[color-mix(in_srgb,var(--color-panel-2)_40%,var(--color-panel))] text-haze",
				className,
			)}
		>
			{initials}
		</span>
	);
}
