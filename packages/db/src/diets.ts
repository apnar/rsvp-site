/**
 * The dietary needs a person can tick. Pure, so the web app draws the
 * boxes, icons and counts from the same list the API validates against.
 * Stored on `user.diets` as a JSON array of ids; read it only through
 * `dietsOf`, which is what lets a preset be retired without a migration.
 */
export const DIETS = [
	{ id: "vegetarian", label: "Vegetarian", count: "vegetarian" },
	{ id: "vegan", label: "Vegan", count: "vegan" },
	{ id: "gluten_free", label: "Gluten-free", count: "gluten-free" },
	{ id: "dairy_free", label: "Dairy-free", count: "dairy-free" },
	{ id: "nuts", label: "Nut allergy", count: "nut allergy" },
	{ id: "shellfish", label: "Shellfish allergy", count: "shellfish allergy" },
] as const;

export type DietId = (typeof DIETS)[number]["id"];

export const DIET_IDS = DIETS.map((d) => d.id) as [DietId, ...DietId[]];

/** What a person says about what they eat. */
export type Diet = { diets: DietId[]; note: string };

export const DIET_NOTE_MAX = 500;

/**
 * The known ids in a stored value, once each, in `DIETS` order. Anything
 * else -- a retired preset, a hand-edited row, a string -- is dropped
 * rather than thrown on, since it is only ever shown.
 */
export function dietsOf(raw: unknown): DietId[] {
	let value = raw;
	if (typeof value === "string") {
		try {
			value = JSON.parse(value);
		} catch {
			return [];
		}
	}
	if (!Array.isArray(value)) return [];
	const picked = new Set(value);
	return DIET_IDS.filter((id) => picked.has(id));
}

export function dietLabel(id: DietId): string {
	return DIETS.find((d) => d.id === id)?.label ?? id;
}

/** "Vegetarian, Nut allergy; no cilantro", for a spreadsheet cell. */
export function dietText(diet: Diet): string {
	const labels = diet.diets.map(dietLabel).join(", ");
	return [labels, diet.note].filter(Boolean).join("; ");
}
