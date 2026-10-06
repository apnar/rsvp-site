import { type DietId, dietLabel } from "@rsvp-site/db/diets";

/** A person's diet as the forms hold it. */
export type DietValue = { diets: DietId[]; note: string };

export const NO_DIET: DietValue = { diets: [], note: "" };

export function sameDiet(a: DietValue, b: DietValue): boolean {
	return (
		a.note.trim() === b.note.trim() &&
		a.diets.length === b.diets.length &&
		a.diets.every((id) => b.diets.includes(id))
	);
}

/** "Vegetarian · Nut allergy · no cilantro", or that there's nothing. */
export function dietSummary(value: DietValue): string {
	const parts = [...value.diets.map(dietLabel), value.note.trim()].filter(
		Boolean,
	);
	return parts.length > 0 ? parts.join(" · ") : "No restrictions";
}
