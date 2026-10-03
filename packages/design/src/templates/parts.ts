import { type FontId, nearestWeight } from "../fonts";
import type { ElementInput } from "../schema";
import type { Placed } from "./types";

type ImageInput = Extract<ElementInput, { type: "image" }>;
export type TextInput = Extract<ElementInput, { type: "text" }>;

/**
 * A text element, typed by its own fields: a plain object literal in a
 * list of elements has to be cast, since the `type` tag widens to string.
 */
export function text(t: Omit<TextInput, "type">): ElementInput {
	return { type: "text", ...t };
}

/** The event's cover photo, placed in a box; `extra` sets mask, border, id. */
export function coverImage(
	cover: Placed,
	box: { x: number; y: number; w: number; h: number },
	extra: Partial<Omit<ImageInput, "type" | "ref" | "iw" | "ih">> = {},
): ElementInput {
	return {
		id: "photo",
		type: "image",
		...box,
		ref: cover.ref,
		iw: cover.iw,
		ih: cover.ih,
		...extra,
	};
}

/** The QR code and its caption, for paper events. */
export function qrBlock(
	paper: boolean,
	at: { x: number; y: number; size: number },
	caption: { font: FontId; color: string },
	opts: {
		/** The code's own colours; the defaults are dark on white. */
		fg?: string;
		bg?: string | null;
		/** Overrides for the caption beneath it (words, size, box). */
		caption?: Partial<Omit<TextInput, "type" | "id">>;
	} = {},
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
			...(opts.fg !== undefined && { fg: opts.fg }),
			...(opts.bg !== undefined && { bg: opts.bg }),
		},
		text({
			id: "scan",
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
			...opts.caption,
		}),
	];
}
