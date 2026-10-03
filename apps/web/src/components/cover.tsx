import { cn } from "@rsvp-site/ui/lib/utils";

import { coverSrc } from "@/lib/format";

/**
 * An event's cover photo, or -- with none -- a plum night with a lime and a
 * pink glow, so an event without a photo still looks like a party.
 */
export function Cover({
	coverKey,
	className,
	alt = "",
}: {
	coverKey: string | null;
	className?: string;
	alt?: string;
}) {
	if (coverKey) {
		return (
			<img
				src={coverSrc(coverKey)}
				alt={alt}
				className={cn("block size-full object-cover", className)}
			/>
		);
	}
	return (
		<div
			aria-hidden
			className={cn("size-full", className)}
			style={{
				background:
					"radial-gradient(circle at 20% 30%, color-mix(in oklab, var(--color-lime) 35%, transparent), transparent 45%), radial-gradient(circle at 80% 70%, color-mix(in oklab, var(--color-pink) 40%, transparent), transparent 50%), var(--color-panel-2)",
			}}
		/>
	);
}
