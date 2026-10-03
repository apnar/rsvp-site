import { Button } from "@rsvp-site/ui/components/button";

import { plural } from "@/lib/format";

import { CancelEvent } from "./cancel-event";
import { DeleteDraft } from "./delete-draft";
import { type Loaded, sendLabel } from "./form";
import type { EventDraft } from "./use-event-draft";
import type { SaveEvent } from "./use-save-event";

/** Delete or cancel, save, preview and send, and why Send might be missing. */
export function ActionsBar({
	loaded,
	draft,
	save,
}: {
	loaded?: Loaded;
	draft: EventDraft;
	save: SaveEvent;
}) {
	const { form, moved, newPeople } = draft;
	const { busy, run } = save;
	const eventId = loaded?.event.id;
	const status = loaded?.event.status ?? "draft";
	const published = status === "published";
	const sendCount = eventId ? (loaded?.notInvited ?? 0) : 0;
	// Paper guests stay "not invited" while emails are held, so a published
	// paper event would show a Send that does nothing; it starts emails from
	// the guest list.
	const held = published && !!loaded?.emailsHeld;

	return (
		<>
			<div className="flex flex-wrap justify-end gap-2.5">
				{status === "draft" && eventId ? (
					<DeleteDraft eventId={eventId} />
				) : null}
				{published && eventId ? (
					<CancelEvent
						eventId={eventId}
						stillComing={loaded?.stillComing ?? 0}
					/>
				) : null}
				<Button variant="outline" disabled={busy} onClick={() => run("stay")}>
					{status === "draft"
						? "Save draft"
						: moved
							? `Save and tell ${plural(loaded?.stillComing ?? 0, "guest")}`
							: "Save"}
				</Button>
				<Button
					variant="secondary"
					disabled={busy}
					onClick={() => run("preview")}
				>
					Preview as guest
				</Button>
				{status === "canceled" || held ? null : status === "draft" ||
					sendCount > 0 ||
					newPeople ? (
					<Button
						variant="send"
						size="lg"
						disabled={busy || !form.date}
						onClick={() => run("send")}
					>
						{sendLabel(form.paper, status, sendCount)}
					</Button>
				) : null}
			</div>
			{status === "draft" && !form.date ? (
				<span className="self-end text-[13px] text-haze">
					Pick a date to send.
				</span>
			) : null}
		</>
	);
}
