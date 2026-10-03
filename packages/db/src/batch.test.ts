import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { chunk, insertChunks } from "./batch";
import { user } from "./schema/auth";
import { contact } from "./schema/contact";

describe("chunk", () => {
	it("splits in order and keeps the remainder", () => {
		expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
		expect(chunk([], 3)).toEqual([]);
	});
});

describe("insertChunks", () => {
	it("keeps every statement under D1's 100 bound parameters", () => {
		for (const table of [user, contact]) {
			const columns = Object.keys(getTableColumns(table)).length;
			const slices = insertChunks(table, new Array(500).fill(0));
			expect(slices.flat()).toHaveLength(500);
			for (const s of slices) {
				expect(s.length).toBeGreaterThan(0);
				expect(s.length * columns).toBeLessThanOrEqual(100);
			}
		}
	});
});
