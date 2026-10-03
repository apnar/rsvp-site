import { fromTemplate, TEMPLATES } from "@rsvp-site/design/templates/index";
import { describe, expect, it } from "vitest";

import { needsQr } from "./design-rules";

const first = TEMPLATES[0];
if (!first) throw new Error("no templates");
const withCode = fromTemplate(first, { cover: null, paper: true });
const withoutCode = {
	...withCode,
	elements: withCode.elements.filter((e) => e.type !== "qr"),
};

describe("needsQr", () => {
	it("asks a paper event's card for a printable code", () => {
		expect(() => needsQr({ paper: true }, true, withoutCode)).toThrow(
			/QR code/,
		);
		expect(() => needsQr({ paper: true }, true, null)).toThrow(/QR code/);
		expect(() => needsQr({ paper: true }, true, withCode)).not.toThrow();
	});

	it("leaves a hidden code as no code", () => {
		const hidden = {
			...withCode,
			elements: withCode.elements.map((e) =>
				e.type === "qr" ? { ...e, hidden: true } : e,
			),
		};
		expect(() => needsQr({ paper: true }, true, hidden)).toThrow();
	});

	it("only cares while the design is on, and only for paper", () => {
		expect(() => needsQr({ paper: true }, false, withoutCode)).not.toThrow();
		expect(() => needsQr({ paper: false }, true, withoutCode)).not.toThrow();
	});
});
