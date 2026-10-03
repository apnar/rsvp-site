/**
 * Getting bytes in and a PDF out, for the two PDF builders. No pdf-lib here,
 * so the designer and the guest list can lean on it without a second copy
 * of anything heavy.
 */
import { saveFile } from "./save-file";

export async function bytes(url: string): Promise<ArrayBuffer> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Could not load ${url}`);
	return res.arrayBuffer();
}

function pdfBlob(data: Uint8Array): Blob {
	return new Blob([data as Uint8Array<ArrayBuffer>], {
		type: "application/pdf",
	});
}

/** Hand the browser a PDF to save. */
export function download(data: Uint8Array, fileName: string) {
	saveFile(
		pdfBlob(data),
		fileName.replace(/[\\/:*?"<>|]+/g, "").trim() || "invites.pdf",
	);
}

/** Open a PDF in a new tab, for a look at it rather than a copy of it. */
export function openPdf(data: Uint8Array) {
	const url = URL.createObjectURL(pdfBlob(data));
	window.open(url, "_blank", "noopener");
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
