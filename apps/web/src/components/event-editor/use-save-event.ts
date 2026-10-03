import { useQueryClient } from "@tanstack/react-query";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { DRY_RUN_SUFFIX } from "@/content/site";
import { refreshCard } from "@/lib/design-card";
import { messageOf } from "@/lib/errors";
import { plural } from "@/lib/format";
import { client, orpc } from "@/utils/orpc";

import { fieldsOf, type Loaded } from "./form";
import type { EventDraft } from "./use-event-draft";

type Destination =
	| "/e/$eventId/guests"
	| "/e/$eventId/design"
	| "/e/$eventId"
	| "/e/$eventId/edit";

/**
 * Saving the draft and what follows it: the steps of `save`, the
 * stay/send/preview/design paths of `run`, and the guard against leaving
 * with unsaved changes.
 */
export function useSaveEvent(loaded: Loaded | undefined, draft: EventDraft) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const eventId = loaded?.event.id;
	const [busy, setBusy] = useState(false);
	// A new event's id, kept the moment `create` returns so a retry after a
	// later step failed updates that draft instead of making a second one.
	const createdId = useRef<string | null>(null);
	// Set just before a navigation the editor itself chose, after a save.
	const leaving = useRef(false);

	const blocker = useBlocker({
		shouldBlockFn: () => draft.dirty && !leaving.current,
		enableBeforeUnload: () => draft.dirty && !leaving.current,
		withResolver: true,
	});

	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: orpc.events.key() });

	/** Save everything; returns the event id. */
	const save = async (): Promise<string> => {
		const {
			form,
			items,
			itemsChanged,
			coverFile,
			dropCover,
			pick,
			newPeople,
			cohostEmails,
		} = draft;
		const fields = fieldsOf(form);
		if (!fields.title) throw new Error("Give it a name.");
		let id = eventId ?? createdId.current ?? undefined;
		let notified = 0;
		if (!id) {
			id = (await client.events.create(fields)).id;
			createdId.current = id;
		} else {
			notified = (await client.events.update({ eventId: id, fields })).notified;
		}
		if (coverFile) {
			await client.events.uploadCover({ eventId: id, file: coverFile });
		} else if (dropCover && loaded?.event.coverKey) {
			await client.events.removeCover({ eventId: id });
		}
		if (itemsChanged || (!eventId && items.length > 0)) {
			await client.events.setPotluck({
				eventId: id,
				items: items
					.filter((i) => i.label.trim())
					.map((i) => ({
						id: i.id,
						label: i.label.trim(),
						quantity: i.quantity,
					})),
			});
		}
		if (!eventId) {
			// The draft exists now; co-hosts can be added to it. One that is not
			// a host on the site is reported and the rest still go on.
			for (const email of cohostEmails) {
				try {
					await client.events.addCohost({ eventId: id, email });
				} catch (error) {
					toast.error(`${email}: ${messageOf(error)}`);
				}
			}
		}
		if (!eventId && newPeople) {
			await client.guests.add({
				eventId: id,
				emails: pick.emails,
				groupIds: pick.groupIds,
				userIds: pick.userIds,
			});
		}
		if (loaded?.hasDesign) {
			// The card picture bakes in the date, place and title.
			await refreshCard(id, true).catch(() => {});
		}
		if (notified > 0)
			toast.success(`Told ${plural(notified, "guest")} about the change.`);
		draft.setCoverFile(null);
		draft.setDropCover(false);
		if (eventId) {
			// Re-seed from what the server now holds: new potluck rows get their
			// ids (a second save must not add them again) and the draft stops
			// counting as unsaved.
			const fresh = await queryClient
				.fetchQuery({
					...orpc.events.get.queryOptions({ input: { eventId } }),
					staleTime: 0,
				})
				.catch(() => null);
			if (fresh) draft.reseed(fresh);
		}
		return id;
	};

	const go = (to: Destination, id: string, replace = false) => {
		leaving.current = true;
		return navigate({ to, params: { eventId: id }, replace });
	};

	const run = async (after: "stay" | "send" | "preview" | "design") => {
		setBusy(true);
		try {
			const id = await save();
			if (after === "send") {
				const r = await client.events.send({ eventId: id });
				toast.success(
					r.held
						? "Published. Download the cards from the guest list; no emails go out until you start them."
						: r.sent > 0
							? `Sent ${plural(r.sent, "invite")}.${r.dryRun ? DRY_RUN_SUFFIX : ""}`
							: "Published. Nobody new to invite.",
				);
				await refresh();
				go("/e/$eventId/guests", id);
				return;
			}
			await refresh();
			if (after === "design") {
				go("/e/$eventId/design", id);
				return;
			}
			if (after === "preview") {
				go("/e/$eventId", id);
				return;
			}
			if (!eventId) {
				toast.success("Draft saved.");
				go("/e/$eventId/edit", id, true);
			} else {
				toast.success("Saved.");
			}
		} catch (error) {
			toast.error(messageOf(error));
			// The draft exists even though a later step failed: carry on from the
			// real one, not from this form that would create another.
			if (!eventId && createdId.current) {
				go("/e/$eventId/edit", createdId.current, true);
			}
		} finally {
			setBusy(false);
		}
	};

	const saveAndLeave = async () => {
		setBusy(true);
		try {
			await save();
			leaving.current = true;
			blocker.proceed?.();
		} catch (error) {
			toast.error(messageOf(error));
		} finally {
			setBusy(false);
		}
	};

	return { busy, run, saveAndLeave, blocker, refresh };
}

export type SaveEvent = ReturnType<typeof useSaveEvent>;
