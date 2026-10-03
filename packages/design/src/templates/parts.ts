import { type FontId, nearestWeight } from "../fonts";
import type { ElementInput } from "../schema";

/** The QR code and its caption, for paper events. */
export function qrBlock(
	paper: boolean,
	at: { x: number; y: number; size: number },
	caption: { font: FontId; color: string },
): ElementInput[] {
	if (!paper) return [];
	return [
		{
			id: "qr",
			type: "qr",
			x: at.x,
			y: at.y,
			w: at.size,
			h: at.size,
			show: "paper",
		},
		{
			id: "scan",
			type: "text",
			x: at.x - 40,
			y: at.y + at.size + 6,
			w: at.size + 80,
			h: 34,
			text: "Scan to RSVP",
			font: caption.font,
			weight: nearestWeight(caption.font, 700),
			size: 24,
			align: "center",
			color: caption.color,
			show: "paper",
		},
	];
}
