import type { AnswerSet } from "@rsvp-site/api/answer-words";
import { Button } from "@rsvp-site/ui/components/button";
import { cn } from "@rsvp-site/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useState } from "react";

import { Avatar } from "@/components/brand";
import { ConfirmAction } from "@/components/confirm-action";
import { DietIcons } from "@/components/diet";
import { PaperActions } from "@/components/paper/paper-actions";
import { AnswerTag } from "@/components/response-bar";
import type { Print } from "@/lib/cards-pdf";
import { initials, plural } from "@/lib/format";
import { orpc } from "@/utils/orpc";
import { AddEmail } from "./add-email";
import { AnswerEditor } from "./answer-editor";
import { rowSubtitle } from "./row-subtitle";
import type { Guest } from "./types";

/** The " · " between two notes, only when something follows. */
const sep = (next: string) => (next ? " · " : null);

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
	potluck: boolean;
	canNudge: boolean;
	nowMs: number;
	print: Print;
	answers: AnswerSet;
};

/**
 * The guest list's grid, which every row takes as a subgrid. Shared, the
 * columns size to what the whole list holds: the actions column is as wide
 * as the widest row's buttons rather than a fixed allowance for a nudge
 * most rows never show, and a column nobody on the list fills (bringing,
 * with no potluck) closes up. The notes get what that frees. The edge
 * columns are max-content because a subgrid's padding lands in them.
 */
export const GUEST_COLUMNS =
	"md:grid md:grid-cols-[max-content_minmax(0,1fr)_fit-content(120px)_fit-content(120px)_fit-content(140px)_minmax(0,1.6fr)_max-content] md:gap-x-5";

/**
 * What is wrong with reaching a guest, as few pills as will say it: the
 * email being off, the texts being off or failing, and "Can't reach" only
 * when nothing above already explains why neither works. A name-only guest
 * (no email, no number) is not a fault, so it gets none.
 */
function rowPills(g: Guest) {
	const pills: { label: string; title?: string }[] = [];
	if (g.emailOff) pills.push({ label: "No email" });
	if (g.textsOff || g.textBlock === "stop") {
		pills.push({
			label: "Texts off",
			title: g.textBlock === "stop" ? "Replied STOP" : "Switched texts off",
		});
	}
	if (g.lastText?.status === "failed") {
		pills.push({
			label: "Text failed",
			title: g.lastText.reason ?? g.textBlock ?? undefined,
		});
	}
	if (g.unreachable && !g.noEmail && pills.length === 0) {
		pills.push({ label: "Can't reach" });
	}
	return pills;
}

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
	const { nowMs, canNudge, paper, potluck, print } = event;
	const eventId = event.id;
	const [editing, setEditing] = useState(false);
	const allowing = useMutation(orpc.guests.allowTexts.mutationOptions());
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
	const pills = rowPills(g);
	const hasNotes =
		g.diets.length > 0 || !!g.dietNote || !!g.partyDiet || !!g.note;
	const coming = g.response === "yes" || g.response === "maybe";

	return (
		<div
			className={cn(
				// The columns are the list's (`GUEST_COLUMNS`), so they line up
				// down it whatever each row holds.
				"relative flex flex-wrap items-center gap-x-5 gap-y-2.5 rounded-[20px] px-5 py-4 max-md:pr-12 md:col-span-full md:grid md:grid-cols-subgrid",
				waiting && "border border-line-strong border-dashed",
				out && "bg-panel-dim text-haze",
				!waiting && !out && "bg-panel",
			)}
		>
			<Avatar
				initials={initials(g.name)}
				image={g.image}
				tone={isYou ? "pink" : waiting ? "outline" : out ? "dim" : "plain"}
			/>
			<div className="min-w-0 flex-[1_1_200px]">
				<b className={cn("text-[17px]", out && "text-soft")}>{g.name}</b>
				<div className="text-[13px] text-haze">
					<div className="truncate" title={sub.lead}>
						{sub.lead}
					</div>
					{sub.status ? <div className="truncate">{sub.status}</div> : null}
				</div>
				{via ? (
					<div className="truncate text-[12px] text-pink-ink">{via}</div>
				) : null}
				{g.noEmail ? <AddEmail eventId={eventId} guestId={g.id} /> : null}
			</div>
			{/* Every column is drawn on every row, empty or not, so the tags and
			    the counts line up down the list; the empties drop out on a phone,
			    where the row wraps anyway. */}
			<span className="flex flex-col items-start gap-1 max-md:w-[96px]">
				<AnswerTag response={g.response} words={event.answers.words} />
				{g.answeredByName && g.response !== null ? (
					<span className="text-[11px] text-haze">
						Answered by {g.answeredByName}
					</span>
				) : null}
				{pills.map((p) => (
					<span
						key={p.label}
						title={p.title}
						className="rounded-full border border-pink px-2 py-px text-[11px] text-pink-ink"
					>
						{p.label}
					</span>
				))}
			</span>
			<span
				className={cn(
					"flex-[0_0_120px] text-[14px] text-soft",
					!coming && "max-md:hidden",
				)}
			>
				{coming ? party(g) : null}
			</span>
			{/* With potluck off the column stays, empty, so the notes line up
			    with every other event's list. */}
			<span
				className={cn(
					"flex-[0_0_140px] text-[14px] text-soft",
					!(coming && potluck) && "max-md:hidden",
				)}
			>
				{coming && potluck ? (
					g.bringing.length > 0 ? (
						g.bringing.join(", ")
					) : (
						<span className="text-haze">Nothing claimed</span>
					)
				) : null}
			</span>
			<span
				className={cn(
					"min-w-0 flex-[1_1_160px] text-[14px] text-soft",
					!hasNotes && "max-md:hidden",
				)}
			>
				{g.diets.length > 0 ? (
					<DietIcons
						diets={g.diets}
						className="align-text-bottom text-pink-ink"
					/>
				) : null}
				{g.diets.length > 0 && g.dietNote ? " " : null}
				{g.dietNote ? (
					<span className="text-pink-ink">{g.dietNote}</span>
				) : null}
				{g.diets.length > 0 || g.dietNote ? sep(g.partyDiet || g.note) : null}
				{g.partyDiet ? (
					<span className="text-pink-ink">
						<span className="text-haze">Party:</span> {g.partyDiet}
					</span>
				) : null}
				{g.partyDiet ? sep(g.note) : null}
				{g.note ? `"${g.note}"` : null}
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
				{g.canVouch && !g.textable ? (
					<ConfirmAction
						size="xs"
						confirm="They expect texts from me"
						cancel="Never mind"
						confirmVariant="default"
						pending={allowing.isPending}
						onConfirm={(close) =>
							allowing.mutate({ eventId, guestId: g.id }, { onSuccess: close })
						}
						trigger={{
							variant: "outline",
							size: "xs",
							children: "Allow texts",
						}}
					/>
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
					answers={event.answers}
					onDone={() => setEditing(false)}
				/>
			) : null}
		</div>
	);
}
