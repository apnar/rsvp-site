import { Button } from "@rsvp-site/ui/components/button";
import { cn } from "@rsvp-site/ui/lib/utils";
import { Pencil } from "lucide-react";
import { useState } from "react";

import { Avatar } from "@/components/brand";
import { ConfirmAction } from "@/components/confirm-action";
import { PaperActions } from "@/components/paper/paper-actions";
import { AnswerTag } from "@/components/response-bar";
import type { Print } from "@/lib/cards-pdf";
import { initials, plural } from "@/lib/format";
import { AddEmail } from "./add-email";
import { AnswerEditor } from "./answer-editor";
import { rowSubtitle } from "./row-subtitle";
import type { Guest } from "./types";

function party(g: Guest) {
	// A child a relative answered for is stored as 0 adults and 1 kid.
	return [
		...(g.adults > 0 || g.kids === 0 ? [plural(g.adults, "adult")] : []),
		...(g.kids > 0 ? [plural(g.kids, "kid")] : []),
	].join(" · ");
}

/** What every row shares about the event, so a row takes one object. */
export type RowEvent = {
	id: string;
	title: string;
	paper: boolean;
	canNudge: boolean;
	nowMs: number;
	print: Print;
};

export function GuestRow({
	guest: g,
	isYou,
	event,
	nudging,
	onNudge,
	onRemove,
	removing,
	familyOnList = false,
}: {
	guest: Guest;
	isYou: boolean;
	event: RowEvent;
	nudging: boolean;
	onNudge: () => void;
	onRemove: () => void;
	removing: boolean;
	/** Another guest on this list is in the same family (see `rowSubtitle`). */
	familyOnList?: boolean;
}) {
	const { nowMs, canNudge, paper, print } = event;
	const eventId = event.id;
	const [editing, setEditing] = useState(false);
	const waiting = g.response === null;
	const out = g.response === "no";
	const sub = rowSubtitle(g, { isYou, paper, nowMs, familyOnList });
	// Whose friend they are, for anybody the host did not choose.
	const via =
		g.source === "guest"
			? `Added by ${g.addedByName ?? "a guest"}`
			: g.source === "link"
				? "Joined by share link"
				: null;
	const note = [g.dietary, g.note ? `"${g.note}"` : ""].filter(Boolean);
	const coming = g.response === "yes" || g.response === "maybe";

	return (
		<div
			className={cn(
				"relative flex flex-wrap items-center gap-x-5 gap-y-2.5 rounded-[20px] px-5 py-4 max-md:pr-12 md:grid",
				// One fixed actions column per kind of event, so the tags line up
				// down the list whatever buttons a row has.
				paper
					? "md:grid-cols-[44px_minmax(0,1.3fr)_96px_110px_120px_minmax(0,1fr)_336px]"
					: "md:grid-cols-[44px_minmax(0,1.3fr)_96px_120px_140px_minmax(0,1fr)_220px]",
				waiting && "border border-line-strong border-dashed",
				out && "bg-panel-dim text-haze",
				!waiting && !out && "bg-panel",
			)}
		>
			<Avatar
				initials={initials(g.name)}
				tone={isYou ? "pink" : waiting ? "outline" : out ? "dim" : "plain"}
			/>
			<div className="min-w-0 flex-[1_1_200px]">
				<b className={cn("text-[17px]", out && "text-soft")}>{g.name}</b>
				<div className="truncate text-[13px] text-haze">{sub}</div>
				{via ? (
					<div className="truncate text-[12px] text-pink-ink">{via}</div>
				) : null}
				{g.noEmail ? <AddEmail eventId={eventId} guestId={g.id} /> : null}
			</div>
			{/* Every column is drawn on every row, empty or not, so the tags and
			    the counts line up down the list; the empties drop out on a phone,
			    where the row wraps anyway. */}
			<span className="flex w-[96px] flex-col items-start gap-1">
				<AnswerTag response={g.response} />
				{g.answeredByName && g.response !== null ? (
					<span className="text-[11px] text-haze">
						Answered by {g.answeredByName}
					</span>
				) : null}
				{g.unreachable && !g.noEmail ? (
					<span className="rounded-full border border-pink px-2 py-px text-[11px] text-pink-ink">
						No email
					</span>
				) : null}
			</span>
			<span
				className={cn(
					"flex-[0_0_120px] text-[14px] text-soft",
					!coming && "max-md:hidden",
				)}
			>
				{coming ? party(g) : null}
			</span>
			<span
				className={cn(
					"flex-[0_0_140px] text-[14px] text-soft",
					!coming && "max-md:hidden",
				)}
			>
				{coming ? (
					g.bringing.length > 0 ? (
						g.bringing.join(", ")
					) : (
						<span className="text-haze">Nothing yet</span>
					)
				) : null}
			</span>
			<span
				className={cn(
					"min-w-0 flex-[1_1_160px] text-[14px]",
					g.dietary ? "text-pink-ink" : "text-soft",
					note.length === 0 && "max-md:hidden",
				)}
			>
				{note.join(" · ")}
			</span>
			<span className="flex items-center justify-end gap-1.5 max-md:empty:hidden md:ml-auto md:min-w-[40px]">
				{paper ? (
					<PaperActions
						eventId={eventId}
						eventTitle={event.title}
						print={print}
						guest={g}
					/>
				) : null}
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label={`Edit ${g.name}'s answer`}
					aria-expanded={editing}
					className={editing ? "bg-ink/10 text-ink" : "text-haze"}
					onClick={() => setEditing((v) => !v)}
				>
					<Pencil strokeWidth={1.5} />
				</Button>
				{waiting && canNudge && g.invitedAt && !g.unreachable ? (
					<Button variant="pink" size="sm" disabled={nudging} onClick={onNudge}>
						Send a nudge
					</Button>
				) : null}
				<ConfirmAction
					size="xs"
					confirm="Remove"
					pending={removing}
					onConfirm={() => onRemove()}
					trigger={{
						variant: "ghost",
						size: "icon-xs",
						"aria-label": `Remove ${g.name}`,
						// In the corner on a phone, so it does not take a line of
						// its own; in its column otherwise.
						className: "text-haze max-md:absolute max-md:top-3 max-md:right-3",
						children: "×",
					}}
				/>
			</span>
			{editing ? (
				<AnswerEditor
					eventId={eventId}
					guest={g}
					onDone={() => setEditing(false)}
				/>
			) : null}
		</div>
	);
}
