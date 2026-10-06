import { describe, expect, it } from "vitest";

import { phoneLines } from "./phone-lines";

describe("phoneLines", () => {
	it("finds nothing in plain addresses and names", () => {
		expect(phoneLines("linh@example.com\nPriya Shah")).toEqual({
			any: false,
			phoneOnly: false,
		});
	});

	it("sees a number beside an address as a phone but not phone-only", () => {
		expect(phoneLines("Linh <linh@example.com> 301-555-1212")).toEqual({
			any: true,
			phoneOnly: false,
		});
	});

	it("flags a line that has only a number", () => {
		expect(phoneLines("a@b.co\nPat Smith 301-555-0101").phoneOnly).toBe(true);
	});

	it("splits on semicolons and commas as the server does", () => {
		expect(phoneLines("a@b.co 3015551212; Pat 3015550101").phoneOnly).toBe(
			true,
		);
	});

	it("needs ten digits, so a short number does not count", () => {
		expect(phoneLines("Pat 555-0101").any).toBe(false);
	});
});
