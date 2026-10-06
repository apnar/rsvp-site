import { describe, expect, it } from "vitest";

import { readCapped } from "./body";

const post = (body: BodyInit, headers?: Record<string, string>) =>
	new Request("https://x.test/", { method: "POST", body, headers });

describe("readCapped", () => {
	it("reads a body under the cap", async () => {
		expect(await readCapped(post("hello"), 10)).toBe("hello");
	});
	it("reads an empty body as empty text", async () => {
		expect(await readCapped(new Request("https://x.test/"), 10)).toBe("");
	});
	it("refuses a body over the cap while reading it", async () => {
		expect(await readCapped(post("x".repeat(11)), 10)).toBeNull();
	});
	it("refuses on the declared length without reading", async () => {
		const request = post("hi", { "content-length": "999999" });
		expect(await readCapped(request, 10)).toBeNull();
		expect(request.bodyUsed).toBe(false);
	});
});
