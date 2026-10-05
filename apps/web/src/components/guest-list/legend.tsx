import type { Guest } from "./types";

type Legendable = Pick<
	Guest,
	| "userId"
	| "source"
	| "dietary"
	| "note"
	| "emailOff"
	| "textsOff"
	| "textBlock"
>;

/**
 * What the pink on the rows means. Pink is otherwise "maybe" and "send",
 * so a host reading a pink note as an alarm, or a pink line as a maybe,
 * needs telling. Only what this list actually shows is listed.
 */
export function GuestLegend({
	guests,
	youId,
}: {
	guests: readonly Legendable[];
	youId: string;
}) {
	const items = [
		guests.some((g) => g.userId === youId) ? (
			<span key="you" className="flex items-center gap-1.5">
				<span aria-hidden className="size-2.5 rounded-full bg-pink" />
				You
			</span>
		) : null,
		guests.some((g) => g.dietary) ? (
			<span key="dietary" className="text-pink-ink">
				Dietary notes
			</span>
		) : null,
		guests.some((g) => g.note) ? (
			<span key="note" className="text-soft">
				"Note for the hosts"
			</span>
		) : null,
		guests.some((g) => g.source === "guest" || g.source === "link") ? (
			<span key="via" className="text-pink-ink">
				Added by a guest or the share link
			</span>
		) : null,
		guests.some((g) => g.emailOff || g.textsOff || g.textBlock === "stop") ? (
			<span key="off" className="text-pink-ink">
				Email or texts turned off
			</span>
		) : null,
	].filter(Boolean);
	if (items.length === 0) return null;
	return (
		<p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-haze">
			<span className="kicker">Key</span>
			{items}
		</p>
	);
}
