import { describe, expect, it } from "vitest";

import { arrivalOf } from "./arrival";

const headers = (cookie?: string) =>
	new Headers(cookie === undefined ? {} : { cookie });

describe("arrivalOf", () => {
	it("reads the link a guest came by", () => {
		expect(arrivalOf(headers("arrived_via=email"))).toBe("email");
		expect(arrivalOf(headers("a=1; arrived_via=text; b=2"))).toBe("text");
	});
	it("is direct with no cookie, or one it doesn't know", () => {
		expect(arrivalOf(headers())).toBe("direct");
		expect(arrivalOf(headers("other=email"))).toBe("direct");
		expect(arrivalOf(headers("arrived_via=paper"))).toBe("direct");
		expect(arrivalOf(headers("arrived_via=host"))).toBe("direct");
	});
});
