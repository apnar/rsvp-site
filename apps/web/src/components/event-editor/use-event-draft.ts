import { useEffect, useState } from "react";

import { coverSrc } from "@/lib/format";

import { type GuestPick, hasPick, NO_PICK } from "../guest-picker";
import {
	BLANK,
	type EventForm,
	formOf,
	type Item,
	itemsOf,
	itemsSig,
	type Loaded,
} from "./form";

/**
 * The host's draft of the event: the form, the potluck rows, a chosen cover
 * and, on a new event, who to put on the list when it is first saved.
 *
 * The draft is seeded once and never re-synced from the query, which
 * refetches on focus and after every guest or co-host change and would
 * otherwise wipe what they have typed. `base` is what the server had when
 * the draft last matched it; only the host's own save moves it (`reseed`).
 */
export function useEventDraft(loaded?: Loaded) {
	const eventId = loaded?.event.id;
	const published = (loaded?.event.status ?? "draft") === "published";

	const [base, setBase] = useState(() => ({
		form: loaded ? formOf(loaded) : BLANK,
		items: itemsOf(loaded),
	}));
	const [form, setForm] = useState<EventForm>(base.form);
	const [items, setItems] = useState<Item[]>(base.items);
	const [coverFile, setCoverFile] = useState<File | null>(null);
	const [coverPreview, setCoverPreview] = useState<string | null>(null);
	const [dropCover, setDropCover] = useState(false);
	// New events only: who to put on the list when the draft is first saved.
	const [pick, setPick] = useState<GuestPick>(NO_PICK);
	// New events only: co-hosts to add once the draft exists.
	const [cohostEmails, setCohostEmails] = useState<string[]>([]);

	useEffect(() => {
		if (!coverFile) return;
		const url = URL.createObjectURL(coverFile);
		setCoverPreview(url);
		return () => URL.revokeObjectURL(url);
	}, [coverFile]);

	const set = <K extends keyof EventForm>(key: K, value: EventForm[K]) =>
		setForm((f) => ({ ...f, [key]: value }));

	const itemsChanged = itemsSig(items) !== itemsSig(base.items);

	const moved =
		published &&
		form.notifyChanges &&
		(form.date !== base.form.date ||
			form.startTime !== base.form.startTime ||
			form.endTime !== base.form.endTime ||
			form.location.trim() !== base.form.location);
	const newPeople = hasPick(pick);

	const dirty =
		JSON.stringify(form) !== JSON.stringify(base.form) ||
		itemsChanged ||
		coverFile !== null ||
		dropCover ||
		(!eventId && (newPeople || cohostEmails.length > 0));

	const coverShown =
		coverPreview ??
		(dropCover
			? null
			: loaded?.event.coverKey
				? coverSrc(loaded.event.coverKey)
				: null);

	/** Re-seed from what the server now holds after the host's own save. */
	const reseed = (fresh: Loaded) => {
		const next = { form: formOf(fresh), items: itemsOf(fresh) };
		setBase(next);
		setForm(next.form);
		setItems(next.items);
	};

	return {
		form,
		set,
		items,
		setItems,
		itemsChanged,
		coverFile,
		setCoverFile,
		setCoverPreview,
		dropCover,
		setDropCover,
		coverShown,
		pick,
		setPick,
		newPeople,
		cohostEmails,
		setCohostEmails,
		moved,
		dirty,
		reseed,
	};
}

export type EventDraft = ReturnType<typeof useEventDraft>;
