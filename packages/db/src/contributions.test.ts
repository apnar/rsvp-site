import { describe, expect, it } from "vitest";

import { dollars, tally, tallyLine, unpaidIds } from "./contributions";
import type { ContributionStatus } from "./schema/contribution";

const rows = (...statuses: ContributionStatus[]) =>
	statuses.map((status) => ({ status }));

describe("tally", () => {
	it("starts with nobody paid and everybody billed", () => {
		const t = tally(rows("unpaid", "unpaid", "unpaid"), 40);
		expect(t).toEqual({
			billed: 3,
			paid: 0,
			unpaid: 3,
			excused: 0,
			collected: 0,
			expected: 120,
		});
	});

	it("keeps the excused out of both numbers", () => {
		const t = tally(rows("paid", "paid", "unpaid", "excused"), 40);
		expect(t.billed).toBe(3);
		expect(t.expected).toBe(120);
		expect(t.collected).toBe(80);
		expect(t.excused).toBe(1);
	});

	it("says it in one line", () => {
		const t = {
			billed: 22,
			paid: 14,
			unpaid: 8,
			excused: 0,
			collected: 560,
			expected: 880,
		};
		expect(tallyLine(t)).toBe("14 of 22 paid, $560 of $880.");
	});

	it("mentions the excused only when there are any", () => {
		const t = {
			billed: 22,
			paid: 14,
			unpaid: 8,
			excused: 2,
			collected: 560,
			expected: 880,
		};
		expect(tallyLine(t)).toBe("14 of 22 paid, $560 of $880. 2 excused.");
	});

	it("puts the comma in a thousand", () => {
		expect(dollars(1200)).toBe("$1,200");
		expect(dollars(40)).toBe("$40");
		expect(dollars(0)).toBe("$0");
	});

	it("names only the unpaid for a reminder", () => {
		const ledger = [
			{ userId: "a", status: "unpaid" as const },
			{ userId: "b", status: "paid" as const },
			{ userId: "c", status: "excused" as const },
			{ userId: "d", status: "unpaid" as const },
		];
		expect(unpaidIds(ledger)).toEqual(["a", "d"]);
	});
});
