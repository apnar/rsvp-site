import { describe, expect, it } from "vitest";

import { dietSummary, NO_DIET, sameDiet } from "./diet-value";

describe("sameDiet", () => {
	it("ignores the order of presets and padding on the note", () => {
		expect(
			sameDiet(
				{ diets: ["vegan", "nuts"], note: " no cilantro" },
				{ diets: ["nuts", "vegan"], note: "no cilantro " },
			),
		).toBe(true);
	});

	it("tells different presets or notes apart", () => {
		expect(sameDiet({ diets: ["vegan"], note: "" }, NO_DIET)).toBe(false);
		expect(
			sameDiet({ diets: ["vegan"], note: "" }, { diets: ["nuts"], note: "" }),
		).toBe(false);
		expect(sameDiet(NO_DIET, { diets: [], note: "x" })).toBe(false);
	});
});

describe("dietSummary", () => {
	it("says there is nothing when there is nothing", () => {
		expect(dietSummary(NO_DIET)).toBe("No restrictions");
		expect(dietSummary({ diets: [], note: "  " })).toBe("No restrictions");
	});

	it("joins labels and the note", () => {
		expect(
			dietSummary({ diets: ["vegetarian", "nuts"], note: "no cilantro" }),
		).toBe("Vegetarian · Nut allergy · no cilantro");
	});
});
