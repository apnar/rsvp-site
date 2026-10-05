import { describe, expect, it } from "vitest";

import { dietsOf, dietText } from "./diets";

describe("dietsOf", () => {
	it("keeps known ids once each, in the presets' order", () => {
		expect(dietsOf(["nuts", "vegan", "nuts"])).toEqual(["vegan", "nuts"]);
		expect(dietsOf('["shellfish","vegetarian"]')).toEqual([
			"vegetarian",
			"shellfish",
		]);
	});

	it("drops what it doesn't know rather than throwing", () => {
		expect(dietsOf(["paleo", "vegan"])).toEqual(["vegan"]);
		expect(dietsOf("not json")).toEqual([]);
		expect(dietsOf(null)).toEqual([]);
		expect(dietsOf({ vegan: true })).toEqual([]);
	});
});

describe("dietText", () => {
	it("joins the labels and the note", () => {
		expect(dietText({ diets: ["vegan", "nuts"], note: "no cilantro" })).toBe(
			"Vegan, Nut allergy; no cilantro",
		);
		expect(dietText({ diets: [], note: "no cilantro" })).toBe("no cilantro");
		expect(dietText({ diets: [], note: "" })).toBe("");
	});
});
