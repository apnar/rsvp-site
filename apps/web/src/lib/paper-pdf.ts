/**
 * Paper invitations, built in the host's browser. The Worker's free plan
 * gives a request about ten milliseconds of CPU, which a hundred pages of
 * fonts, photos and QR codes would blow through; the browser has all the
 * time it wants and the host is the only one who needs the file.
 *
 * Loaded with a dynamic import from the guest list, so pdf-lib, fontkit and
 * the QR encoder stay out of every other page's bundle.
 */

import manropeUrl from "@fontsource/manrope/files/manrope-latin-500-normal.woff?url";
import manropeBoldUrl from "@fontsource/manrope/files/manrope-latin-700-normal.woff?url";
import unboundedBoldUrl from "@fontsource/unbounded/files/unbounded-latin-700-normal.woff?url";
import unboundedBlackUrl from "@fontsource/unbounded/files/unbounded-latin-900-normal.woff?url";

import {
	layoutPaperInvites,
	type PaperEvent,
	type PaperGuest,
} from "./paper-pdf-core";
import type { PaperSize } from "./paper-sizes";

export async function bytes(url: string): Promise<ArrayBuffer> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Could not load ${url}`);
	return res.arrayBuffer();
}

/**
 * The cover as JPEG bytes, whatever it was uploaded as: pdf-lib embeds only
 * JPEG and PNG, and a WebP cover would otherwise break the whole download.
 */
async function coverJpeg(coverKey: string): Promise<ArrayBuffer | null> {
	try {
		const blob = await (await fetch(`/api/${coverKey}`)).blob();
		const bitmap = await createImageBitmap(blob);
		const canvas = document.createElement("canvas");
		const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
		canvas.width = Math.round(bitmap.width * scale);
		canvas.height = Math.round(bitmap.height * scale);
		canvas
			.getContext("2d")
			?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		const jpeg = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, "image/jpeg", 0.88),
		);
		return jpeg ? jpeg.arrayBuffer() : null;
	} catch {
		return null;
	}
}

export async function buildPaperInvites(input: {
	event: PaperEvent;
	guests: PaperGuest[];
	size: PaperSize;
}): Promise<Uint8Array> {
	const [black, bold, body, bodyBold, cover] = await Promise.all([
		bytes(unboundedBlackUrl),
		bytes(unboundedBoldUrl),
		bytes(manropeUrl),
		bytes(manropeBoldUrl),
		input.event.coverKey
			? coverJpeg(input.event.coverKey)
			: Promise.resolve(null),
	]);
	return layoutPaperInvites({
		...input,
		assets: { black, bold, body, bodyBold, cover },
	});
}

/** Hand the browser a file to save. */
export function download(data: Uint8Array, fileName: string) {
	const url = URL.createObjectURL(
		new Blob([data as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
	);
	const link = document.createElement("a");
	link.href = url;
	link.download =
		fileName.replace(/[\\/:*?"<>|]+/g, "").trim() || "invites.pdf";
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
