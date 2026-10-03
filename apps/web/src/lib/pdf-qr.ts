import { rgb as parseHex } from "@rsvp-site/design/paint";
import { type PDFPage, type RGB, rgb } from "pdf-lib";
import QRCode from "qrcode";

export function hexColor(hex: string): RGB {
	const [r, g, b] = parseHex(hex);
	return rgb(r / 255, g / 255, b / 255);
}

/**
 * A QR code as vector squares, sharp at any print size, with a two-module
 * quiet zone inside the box. (x, y) is the box's bottom-left corner.
 *
 * Level Q survives about a quarter of the code smudged, folded or lost to a
 * low-contrast colour. A card's URL (`paperCardUrl`, a 16-character key)
 * fits it at 29 modules square, smaller than the 32-character keys made at
 * level M, so the squares print bigger as well.
 */
export function drawQr(
	page: PDFPage,
	url: string,
	box: { x: number; y: number; size: number },
	colors: { fg: RGB; bg: RGB | null; opacity?: number },
) {
	const { x, y, size } = box;
	const qr = QRCode.create(url, { errorCorrectionLevel: "Q" });
	const n = qr.modules.size;
	const quiet = 2;
	const cell = size / (n + quiet * 2);
	if (colors.bg) {
		page.drawRectangle({
			x,
			y,
			width: size,
			height: size,
			color: colors.bg,
			opacity: colors.opacity,
		});
	}
	for (let row = 0; row < n; row++) {
		for (let col = 0; col < n; col++) {
			if (!qr.modules.get(row, col)) continue;
			page.drawRectangle({
				x: x + (col + quiet) * cell,
				// PDF y runs up from the bottom; QR rows run down from the top.
				y: y + size - (row + quiet + 1) * cell,
				width: cell + 0.05,
				height: cell + 0.05,
				color: colors.fg,
				opacity: colors.opacity,
			});
		}
	}
}
