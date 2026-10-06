import type { DietId } from "@rsvp-site/db/diets";
import { formatPhone, normalizePhone } from "@rsvp-site/db/phone";

/** The detail fields a person carries; blank is stored as an empty string. */
const DETAIL_KEYS = [
	"firstName",
	"lastName",
	"phone",
	"addressLine1",
	"addressLine2",
	"city",
	"region",
	"postalCode",
	"country",
] as const;
export type DetailKey = (typeof DETAIL_KEYS)[number];
export type DetailsPatch = Partial<Record<DetailKey, string>> & {
	diets?: DietId[];
	dietNote?: string;
};

/**
 * Only what differs from the saved value; null and "" are the same blank.
 * The phone is compared as stored: the draft shows "(301) 555-1234" but
 * people type "301-555-1234", and comparing text would leave Save lit
 * after every save.
 */
export function changedDetails(
	saved: Record<DetailKey, string | null>,
	draft: Record<DetailKey, string>,
): DetailsPatch {
	const patch: DetailsPatch = {};
	for (const k of DETAIL_KEYS) {
		const typed = draft[k].trim();
		const same =
			k === "phone"
				? (normalizePhone(typed) ?? typed) === (saved[k] ?? "")
				: typed === (saved[k] ?? "").trim();
		if (!same) patch[k] = draft[k];
	}
	return patch;
}

/** A draft that starts from what is saved (the phone as people read it). */
export function draftOf(p: Record<DetailKey, string | null>) {
	const d = {} as Record<DetailKey, string>;
	for (const k of DETAIL_KEYS) {
		d[k] = k === "phone" ? formatPhone(p[k]) : (p[k] ?? "");
	}
	return d;
}
