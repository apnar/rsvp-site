/**
 * The drawing half of paper invitations: given font and photo bytes, lay
 * out the PDF. No browser APIs and no Vite imports, so it can be rendered
 * outside the app to check the layout; `paper-pdf.ts` loads the assets.
 */

import fontkit from "@pdf-lib/fontkit";
import {
	clip,
	endPath,
	PDFDocument,
	type PDFFont,
	type PDFImage,
	type PDFPage,
	popGraphicsState,
	pushGraphicsState,
	rectangle,
	rgb,
} from "pdf-lib";

import type { PaperSize } from "./paper-sizes";
import { drawQr } from "./pdf-qr";

export type { PaperSize };

export type PaperEvent = {
	title: string;
	hostLine: string;
	location: string;
	details: string;
	coverKey: string | null;
	dateLabel: string | null;
	timeLabel: string | null;
	deadlineLabel: string | null;
};

export type PaperGuest = { id: string; name: string; url: string };

const PT = 72;
/** One invitation's size in points, portrait. */
const INVITE: Record<PaperSize, { w: number; h: number }> = {
	card: { w: 5 * PT, h: 7 * PT },
	letter: { w: 8.5 * PT, h: 11 * PT },
	half: { w: 5.5 * PT, h: 8.5 * PT },
};

const C = {
	night: rgb(0x14 / 255, 0x10 / 255, 0x1f / 255),
	ink: rgb(0x1f / 255, 0x19 / 255, 0x30 / 255),
	muted: rgb(0x5e / 255, 0x55 / 255, 0x77 / 255),
	paper: rgb(1, 1, 1),
	lime: rgb(0xc6 / 255, 0xff / 255, 0x3d / 255),
	pink: rgb(0xff / 255, 0x4f / 255, 0xa3 / 255),
	pinkText: rgb(0xb0 / 255, 0x23 / 255, 0x6c / 255),
	line: rgb(0xe4 / 255, 0xde / 255, 0xf0 / 255),
};

type Fonts = {
	black: PDFFont;
	bold: PDFFont;
	body: PDFFont;
	bodyBold: PDFFont;
};

/** Words onto lines no wider than `width`, at most `max` lines, ellipsised. */
function wrap(
	text: string,
	font: PDFFont,
	size: number,
	width: number,
	max: number,
): string[] {
	const lines: string[] = [];
	for (const para of text.split(/\n+/)) {
		let line = "";
		for (const word of para.split(/\s+/).filter(Boolean)) {
			const next = line ? `${line} ${word}` : word;
			if (font.widthOfTextAtSize(next, size) <= width) {
				line = next;
				continue;
			}
			if (line) lines.push(line);
			line = word;
		}
		if (line) lines.push(line);
	}
	if (lines.length <= max) return lines;
	const kept = lines.slice(0, max);
	let last = kept[max - 1] ?? "";
	while (last && font.widthOfTextAtSize(`${last}…`, size) > width) {
		last = last.slice(0, -1);
	}
	kept[max - 1] = `${last.trimEnd()}…`;
	return kept;
}

/** The largest size, down to `min`, at which `text` fits in `lines` lines. */
function fit(
	text: string,
	font: PDFFont,
	start: number,
	min: number,
	width: number,
	lines: number,
): { size: number; lines: string[] } {
	for (let size = start; size > min; size -= 1) {
		const out = wrap(text, font, size, width, 99);
		if (out.length <= lines) return { size, lines: out };
	}
	return { size: min, lines: wrap(text, font, min, width, lines) };
}

/** Draw an image to fill a box, cropped like CSS `object-fit: cover`. */
function drawCover(
	page: PDFPage,
	image: PDFImage,
	x: number,
	y: number,
	w: number,
	h: number,
) {
	const scale = Math.max(w / image.width, h / image.height);
	const iw = image.width * scale;
	const ih = image.height * scale;
	page.pushOperators(
		pushGraphicsState(),
		rectangle(x, y, w, h),
		clip(),
		endPath(),
	);
	page.drawImage(image, {
		x: x + (w - iw) / 2,
		y: y + (h - ih) / 2,
		width: iw,
		height: ih,
	});
	page.pushOperators(popGraphicsState());
}

/** One invitation, drawn into the box at (x, y) of width w and height h. */
function drawInvite(
	page: PDFPage,
	fonts: Fonts,
	event: PaperEvent,
	guest: PaperGuest,
	cover: PDFImage | null,
	box: { x: number; y: number; w: number; h: number },
) {
	const { x, y, w, h } = box;
	const u = w / 360; // everything is laid out for a 5x7 card and scaled
	const pad = 22 * u;
	const inner = w - pad * 2;

	page.drawRectangle({ x, y, width: w, height: h, color: C.paper });

	// The band: the cover photo, or the plum night with a lime and pink glow.
	const bandH = h * 0.42;
	const bandY = y + h - bandH;
	if (cover) {
		drawCover(page, cover, x, bandY, w, bandH);
	} else {
		page.drawRectangle({
			x,
			y: bandY,
			width: w,
			height: bandH,
			color: C.night,
		});
		// The glows are clipped to the band, or they spill onto the card.
		page.pushOperators(
			pushGraphicsState(),
			rectangle(x, bandY, w, bandH),
			clip(),
			endPath(),
		);
		page.drawCircle({
			x: x + w * 0.22,
			y: bandY + bandH * 0.7,
			size: bandH * 0.55,
			color: C.lime,
			opacity: 0.18,
		});
		page.drawCircle({
			x: x + w * 0.8,
			y: bandY + bandH * 0.3,
			size: bandH * 0.6,
			color: C.pink,
			opacity: 0.2,
		});
		page.pushOperators(popGraphicsState());
	}
	// A dark wash under the title so it reads on any photo.
	page.drawRectangle({
		x,
		y: bandY,
		width: w,
		height: bandH * 0.62,
		color: C.night,
		opacity: 0.62,
	});

	const word = "botch";
	const wordSize = 11 * u;
	page.drawText(word, {
		x: x + pad,
		y: y + h - pad - wordSize,
		size: wordSize,
		font: fonts.black,
		color: C.paper,
	});
	const ww = fonts.black.widthOfTextAtSize(word, wordSize);
	page.drawText("•", {
		x: x + pad + ww,
		y: y + h - pad - wordSize,
		size: wordSize,
		font: fonts.black,
		color: C.lime,
	});
	const dw = fonts.black.widthOfTextAtSize("•", wordSize);
	page.drawText("rsvp", {
		x: x + pad + ww + dw,
		y: y + h - pad - wordSize,
		size: wordSize,
		font: fonts.black,
		color: C.paper,
	});

	const title = fit(event.title, fonts.black, 30 * u, 16 * u, inner, 3);
	let cursor = bandY + 16 * u + (title.lines.length - 1) * title.size * 1.02;
	for (const line of title.lines) {
		page.drawText(line, {
			x: x + pad,
			y: cursor,
			size: title.size,
			font: fonts.black,
			color: C.paper,
		});
		cursor -= title.size * 1.02;
	}
	const tag = "YOU'RE INVITED";
	const tagSize = 7.5 * u;
	const tagW = fonts.bold.widthOfTextAtSize(tag, tagSize) + 14 * u;
	const tagY = bandY + 16 * u + title.lines.length * title.size * 1.02 + 6 * u;
	page.drawRectangle({
		x: x + pad,
		y: tagY,
		width: tagW,
		height: tagSize + 9 * u,
		color: C.lime,
		borderWidth: 0,
	});
	page.drawText(tag, {
		x: x + pad + 7 * u,
		y: tagY + 4.5 * u,
		size: tagSize,
		font: fonts.bold,
		color: C.night,
	});

	// The body, top down.
	let top = bandY - 22 * u;
	// "For", not "Dear": guests are often households -- "For The Nguyens".
	const greeting = `For ${guest.name}`;
	page.drawText(greeting, {
		x: x + pad,
		y: top - 13 * u,
		size: 13 * u,
		font: fonts.bodyBold,
		color: C.ink,
	});
	top -= 13 * u + 12 * u;

	const facts: [string, string | null][] = [
		[
			"WHEN",
			[event.dateLabel, event.timeLabel].filter(Boolean).join(" · ") || null,
		],
		["WHERE", event.location || null],
		["HOSTED BY", event.hostLine || null],
	];
	const qrSize = Math.min(118 * u, h * 0.26);
	const textW = inner - qrSize - 14 * u;
	for (const [label, value] of facts) {
		if (!value) continue;
		page.drawText(label, {
			x: x + pad,
			y: top - 7 * u,
			size: 7 * u,
			font: fonts.bold,
			color: C.muted,
		});
		top -= 7 * u + 4 * u;
		for (const line of wrap(value, fonts.bodyBold, 10.5 * u, inner, 2)) {
			page.drawText(line, {
				x: x + pad,
				y: top - 10.5 * u,
				size: 10.5 * u,
				font: fonts.bodyBold,
				color: C.ink,
			});
			top -= 10.5 * u * 1.3;
		}
		top -= 7 * u;
	}

	// The QR block sits in the bottom right; the details fill what is left.
	const qrX = x + w - pad - qrSize;
	const qrY = y + pad + 14 * u;
	if (event.details.trim()) {
		const room = Math.max(
			0,
			Math.floor((top - (qrY + qrSize * 0.1)) / (9.5 * u * 1.35)),
		);
		const width = top - 9.5 * u < qrY + qrSize ? textW : inner;
		for (const line of wrap(
			event.details,
			fonts.body,
			9.5 * u,
			width,
			Math.min(room, 6),
		)) {
			page.drawText(line, {
				x: x + pad,
				y: top - 9.5 * u,
				size: 9.5 * u,
				font: fonts.body,
				color: C.ink,
			});
			top -= 9.5 * u * 1.35;
		}
	}

	drawQr(
		page,
		guest.url,
		{ x: qrX, y: qrY, size: qrSize },
		{ fg: C.night, bg: C.paper },
	);
	page.drawRectangle({
		x: qrX,
		y: qrY,
		width: qrSize,
		height: qrSize,
		borderColor: C.line,
		borderWidth: 1,
	});
	const scan = "Scan to RSVP";
	const scanSize = 8 * u;
	page.drawText(scan, {
		x: qrX + (qrSize - fonts.bold.widthOfTextAtSize(scan, scanSize)) / 2,
		y: qrY - scanSize - 4 * u,
		size: scanSize,
		font: fonts.bold,
		color: C.pinkText,
	});

	const asks = event.deadlineLabel
		? `Please RSVP by ${event.deadlineLabel}.`
		: "Please RSVP.";
	const leftW = inner - qrSize - 14 * u;
	let foot = y + pad + 30 * u;
	page.drawText(asks, {
		x: x + pad,
		y: foot,
		size: 10 * u,
		font: fonts.bodyBold,
		color: C.pinkText,
	});
	foot -= 14 * u;
	for (const line of wrap(
		"Point your phone's camera at the code to answer and see the details.",
		fonts.body,
		8 * u,
		leftW,
		3,
	)) {
		page.drawText(line, {
			x: x + pad,
			y: foot,
			size: 8 * u,
			font: fonts.body,
			color: C.muted,
		});
		foot -= 8 * u * 1.35;
	}
}

/**
 * The PDF: one invitation per page, or two per landscape letter sheet for
 * "half". A single guest's half-letter file is one half-letter page.
 */
export async function layoutPaperInvites(input: {
	event: PaperEvent;
	guests: PaperGuest[];
	size: PaperSize;
	assets: {
		black: ArrayBuffer;
		bold: ArrayBuffer;
		body: ArrayBuffer;
		bodyBold: ArrayBuffer;
		/** The cover as JPEG or PNG bytes (told apart by their signature). */
		cover: ArrayBuffer | null;
	};
}): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	doc.setTitle(`${input.event.title} – invitations`);
	doc.setCreator("Botch RSVP");
	const { black, bold, body, bodyBold, cover: coverBytes } = input.assets;
	const fonts: Fonts = {
		black: await doc.embedFont(black, { subset: true }),
		bold: await doc.embedFont(bold, { subset: true }),
		body: await doc.embedFont(body, { subset: true }),
		bodyBold: await doc.embedFont(bodyBold, { subset: true }),
	};
	const isPng =
		coverBytes !== null && new Uint8Array(coverBytes.slice(0, 4))[1] === 0x50;
	const cover = coverBytes
		? isPng
			? await doc.embedPng(coverBytes)
			: await doc.embedJpg(coverBytes)
		: null;
	const { w, h } = INVITE[input.size];

	if (input.size === "half" && input.guests.length > 1) {
		// Two to a landscape letter sheet, a cut line down the middle.
		for (let i = 0; i < input.guests.length; i += 2) {
			const page = doc.addPage([11 * PT, 8.5 * PT]);
			for (const [slot, guest] of input.guests.slice(i, i + 2).entries()) {
				drawInvite(page, fonts, input.event, guest, cover, {
					x: slot * 5.5 * PT,
					y: 0,
					w: 5.5 * PT,
					h: 8.5 * PT,
				});
			}
			page.drawLine({
				start: { x: 5.5 * PT, y: 0 },
				end: { x: 5.5 * PT, y: 8.5 * PT },
				thickness: 0.5,
				color: C.line,
				dashArray: [4, 4],
			});
		}
	} else {
		for (const guest of input.guests) {
			const page = doc.addPage([w, h]);
			drawInvite(page, fonts, input.event, guest, cover, { x: 0, y: 0, w, h });
		}
	}
	return doc.save();
}
