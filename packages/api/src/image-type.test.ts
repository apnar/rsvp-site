import { describe, expect, it } from "vitest";
import { sniffImage } from "./image-type";

const buf = (...bytes: number[]) => new Uint8Array(bytes).buffer;

describe("sniffImage", () => {
	it("knows the three types by their first bytes", () => {
		expect(sniffImage(buf(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe("image/jpeg");
		expect(sniffImage(buf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a))).toBe(
			"image/png",
		);
		expect(
			sniffImage(
				buf(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50),
			),
		).toBe("image/webp");
	});
	it("refuses anything else, including other RIFF files and short input", () => {
		expect(
			sniffImage(new TextEncoder().encode("<svg xmlns=").buffer as ArrayBuffer),
		).toBe(null);
		expect(
			sniffImage(
				buf(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45),
			),
		).toBe(null);
		expect(sniffImage(buf(0xff, 0xd8))).toBe(null);
		expect(sniffImage(new ArrayBuffer(0))).toBe(null);
	});
});
