import { cn } from "@rsvp-site/ui/lib/utils";
import { useState } from "react";

import { avatarSrc } from "@/lib/format";

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

/**
 * The round badge the design uses for people: their picture, or their
 * initials when there is none (or it fails to load). On a picture the pink
 * "you" tone is a ring, since the fill can't show.
 */
export function Avatar({
	initials,
	image,
	tone = "plain",
	className,
}: {
	initials: string;
	/** The picture's R2 key, from `user.image`. */
	image?: string | null;
	tone?: "pink" | "plain" | "outline" | "dim";
	className?: string;
}) {
	const [broken, setBroken] = useState<string | null>(null);
	const picture = image && image !== broken ? image : null;
	return (
		<span
			aria-hidden
			className={cn(
				"grid size-11 flex-none place-items-center overflow-hidden rounded-full font-bold text-sm",
				picture
					? [
							"bg-panel-2",
							tone === "pink" && "ring-2 ring-pink",
							tone === "outline" && "border border-line-strong",
						]
					: [
							tone === "pink" && "bg-pink text-on-pink",
							tone === "plain" && "bg-panel-2 text-ink",
							tone === "outline" && "border border-line-strong text-haze",
							tone === "dim" &&
								"bg-[color-mix(in_srgb,var(--color-panel-2)_40%,var(--color-panel))] text-haze",
						],
				className,
			)}
		>
			{picture ? (
				<img
					src={avatarSrc(picture)}
					alt=""
					loading="lazy"
					decoding="async"
					onError={() => setBroken(picture)}
					className={cn(
						"size-full object-cover",
						(tone === "dim" || tone === "outline") && "opacity-55",
					)}
				/>
			) : (
				initials
			)}
		</span>
	);
}
