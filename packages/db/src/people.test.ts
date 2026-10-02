import { describe, expect, it } from "vitest";

import { effectiveStatus } from "./people";

const at = (ms: number) => new Date(ms);
const NOW = at(1_000_000);

describe("effectiveStatus", () => {
	it("leaves an active person alone", () => {
		expect(
			effectiveStatus({ status: "active", suspendedUntil: null }, NOW),
		).toBe("active");
	});

	it("keeps an open-ended break running", () => {
		expect(
			effectiveStatus({ status: "suspended", suspendedUntil: null }, NOW),
		).toBe("suspended");
	});

	it("keeps a break that has not run out yet", () => {
		expect(
			effectiveStatus(
				{ status: "suspended", suspendedUntil: at(1_000_001) },
				NOW,
			),
		).toBe("suspended");
	});

	it("ends a break the instant its date arrives", () => {
		// The boundary is inclusive on purpose: "back on the 7th" means they
		// are back on the 7th, not the 8th.
		expect(
			effectiveStatus({ status: "suspended", suspendedUntil: NOW }, NOW),
		).toBe("active");
	});

	it("ends a break whose date has passed, with no job having run", () => {
		expect(
			effectiveStatus(
				{ status: "suspended", suspendedUntil: at(999_999) },
				NOW,
			),
		).toBe("active");
	});

	it("never expires a deactivation, dated or not", () => {
		expect(
			effectiveStatus({ status: "deactivated", suspendedUntil: null }, NOW),
		).toBe("deactivated");
		expect(
			effectiveStatus({ status: "deactivated", suspendedUntil: at(1) }, NOW),
		).toBe("deactivated");
	});
});
