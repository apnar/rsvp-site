import { describe, expect, it } from "vitest";

import { partyLabel, totalsLabel } from "./party";

describe("partyLabel", () => {
	it("says a party's people, never 0 adults", () => {
		expect(partyLabel({ adults: 2, kids: 1 })).toBe("2 adults, 1 kid");
		expect(partyLabel({ adults: 1, kids: 0 })).toBe("1 adult");
		expect(partyLabel({ adults: 0, kids: 1 })).toBe("1 kid");
		expect(partyLabel({ adults: 0, kids: 2 }, " · ")).toBe("2 kids");
	});

	it("counts a party of nobody as one adult, as tally does", () => {
		expect(partyLabel({ adults: 0, kids: 0 })).toBe("1 adult");
		expect(partyLabel({ adults: -1, kids: 0 })).toBe("1 adult");
	});
});

describe("totalsLabel", () => {
	it("gives both counts, but no 0 adults beside kids", () => {
		expect(totalsLabel({ adults: 2, kids: 0 })).toBe("2 adults · 0 kids");
		expect(totalsLabel({ adults: 3, kids: 2 })).toBe("3 adults · 2 kids");
		expect(totalsLabel({ adults: 0, kids: 1 })).toBe("1 kid");
		expect(totalsLabel({ adults: 0, kids: 0 })).toBe("0 adults · 0 kids");
	});
});
