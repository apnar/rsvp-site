import { ORPCError } from "@orpc/client";
import { type Design, parseDesign } from "@rsvp-site/design/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { refreshCard } from "@/lib/design-card";
import { orpc } from "@/utils/orpc";

/**
 * Saving, and knowing whether there is anything to save: the version this
 * editor is at, what was last saved, the "guests see it" switch and the
 * router's warning when somebody leaves with changes.
 */
export function useDesignSave({
	eventId,
	doc,
	initial,
	version: startVersion,
	designOn: startOn,
	unsaved,
	blockingMessage,
	onSaved,
}: {
	eventId: string;
	/** The document as it stands now. */
	doc: Design;
	initial: Design;
	version: number;
	designOn: boolean;
	/** The editor opened on something the server does not have (a template). */
	unsaved: boolean;
	/** Why this design can't be switched on, asked fresh at each save. */
	blockingMessage: (doc: Design) => string | undefined;
	onSaved: (version: number) => void;
}) {
	const queryClient = useQueryClient();
	const [savedDoc, setSavedDoc] = useState<Design | null>(
		unsaved ? null : initial,
	);
	const [version, setVersion] = useState(startVersion);
	const [designOn, setDesignOn] = useState(startOn);
	const [savedOn, setSavedOn] = useState(unsaved ? !startOn : startOn);

	// The only mutation here that has to word its own failure: a conflict
	// means somebody else saved first, and the answer is to reload.
	const saveDesign = useMutation(
		orpc.designs.save.mutationOptions({
			onError: (error) =>
				toast.error(
					error.message,
					error instanceof ORPCError && error.code === "CONFLICT"
						? {
								action: {
									label: "Reload",
									onClick: () => window.location.reload(),
								},
							}
						: undefined,
				),
		}),
	);

	const dirty = doc !== savedDoc || designOn !== savedOn;
	const blocker = useBlocker({
		shouldBlockFn: () => dirty,
		enableBeforeUnload: () => dirty,
		withResolver: true,
	});

	/** Save; true when it went through. */
	const save = async (): Promise<boolean> => {
		const parsed = parseDesign(doc);
		if (!parsed.ok) {
			toast.error(parsed.message);
			return false;
		}
		const blocking = designOn ? blockingMessage(doc) : undefined;
		if (blocking) {
			toast.error(blocking);
			return false;
		}
		try {
			const r = await saveDesign.mutateAsync({
				eventId,
				doc: parsed.design,
				version,
				designOn,
			});
			setVersion(r.version);
			onSaved(r.version);
			setSavedDoc(doc);
			setSavedOn(designOn);
			// What was saved is now what the server has; keep the cached copy
			// in step at once, not after a refetch that could lose a race.
			queryClient.setQueryData(
				orpc.designs.get.queryKey({ input: { eventId } }),
				(old) =>
					old
						? { ...old, doc: parsed.design, version: r.version, designOn }
						: old,
			);
			// The picture emails and link previews show, from what was saved.
			refreshCard(eventId).catch(() =>
				toast.error(
					"The card picture for emails didn't update. Save again to retry.",
				),
			);
			toast.success(
				designOn
					? "Saved. Guests see this card."
					: "Saved. Guests still see the plain invitation.",
			);
			return true;
		} catch {
			// The mutation's onError has said why.
			return false;
		}
	};

	/** The Save button. */
	const saveFromButton = async () => {
		// Saved while being asked about leaving: there is nothing left to
		// warn about, and staying is what the host chose.
		if ((await save()) && blocker.status === "blocked") blocker.reset?.();
	};

	/** "Save and leave" on the bar. */
	const saveAndLeave = async () => {
		if (await save()) blocker.proceed?.();
	};

	return {
		designOn,
		setDesignOn,
		dirty,
		saving: saveDesign.isPending,
		blocker,
		saveFromButton,
		saveAndLeave,
	};
}
