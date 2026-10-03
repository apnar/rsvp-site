import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
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

type After = "stay" | "send" | "preview" | "design";

/**
 * Saving the draft and what follows it: the steps of `save`, the
 * stay/send/preview/design paths of `run`, and the guard against leaving
 * with unsaved changes.
 */
export function useSaveEvent(loaded: Loaded | undefined, draft: EventDraft) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const eventId = loaded?.event.id;
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

	// Both are mutations so the cache refreshes everything a save or a send
	// touched (the guest list included) and says so when a step fails.
	const runEvent = useMutation({
		mutationFn: async (after: After) => {
			const id = await save();
			return {
				id,
				sent:
					after === "send" ? await client.events.send({ eventId: id }) : null,
			};
		},
		onSuccess: ({ id, sent }, after) => {
			if (sent) {
				toast.success(
					sent.held
						? "Published. Download the cards from the guest list; no emails go out until you start them."
						: sent.sent > 0
							? `Sent ${plural(sent.sent, "invite")}.${sent.dryRun ? DRY_RUN_SUFFIX : ""}`
							: "Published. Nobody new to invite.",
				);
				go("/e/$eventId/guests", id);
			} else if (after === "design") {
				go("/e/$eventId/design", id);
			} else if (after === "preview") {
				go("/e/$eventId", id);
			} else if (!eventId) {
				toast.success("Draft saved.");
				go("/e/$eventId/edit", id, true);
			} else {
				toast.success("Saved.");
			}
		},
	});

	const run = (after: After) =>
		runEvent.mutate(after, {
			onError: () => {
				// The draft exists even though a later step failed: carry on from
				// the real one, not from this form that would create another.
				if (!eventId && createdId.current) {
					go("/e/$eventId/edit", createdId.current, true);
				}
			},
		});

	const leave = useMutation({
		mutationFn: save,
		onSuccess: () => {
			leaving.current = true;
			blocker.proceed?.();
		},
	});

	return {
		busy: runEvent.isPending || leave.isPending,
		run,
		saveAndLeave: () => leave.mutate(),
		blocker,
	};
}

export type SaveEvent = ReturnType<typeof useSaveEvent>;
