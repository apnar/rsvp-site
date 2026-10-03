import { describe, expect, it } from "vitest";
import { elementLabel } from "./label";

describe("elementLabel", () => {
	it("prefers the name, then what a text says, then what the thing is", () => {
		expect(elementLabel({ type: "rect", name: "Frame" })).toBe("Frame");
		expect(elementLabel({ type: "text", text: "  Join\n us  " })).toBe(
			"Join us",
		);
		expect(elementLabel({ type: "text", text: "   " })).toBe("Empty text");
		expect(elementLabel({ type: "ellipse" })).toBe("Ellipse");
		expect(elementLabel({ type: "qr" })).toBe("QR code");
		expect(elementLabel({ type: "sticker", sticker: "disco-ball" })).toBe(
			"Sticker: disco ball",
		);
	});

	it("shortens a long text", () => {
		const label = elementLabel({ type: "text", text: "a".repeat(40) });
		expect(label).toBe(`${"a".repeat(28)}…`);
	});
});
