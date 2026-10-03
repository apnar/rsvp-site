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
import { saveFile } from "./save-file";
import { scaleImage } from "./shrink-image";

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
		const { blob } = await scaleImage(
			await (await fetch(`/api/${coverKey}`)).blob(),
			{
				max: 1800,
				type: "image/jpeg",
				quality: 0.88,
			},
		);
		return blob.arrayBuffer();
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

/** Hand the browser a PDF to save. */
export function download(data: Uint8Array, fileName: string) {
	saveFile(
		new Blob([data as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
		fileName.replace(/[\\/:*?"<>|]+/g, "").trim() || "invites.pdf",
	);
}
