/**
 * Paper invitations from a design, built in the host's browser for the
 * same reason as paper-pdf.ts. Loaded with a dynamic import from the guest
 * list and the designer.
 */
import { facesOf, loadFaces } from "@rsvp-site/design/faces";
import type { Values } from "@rsvp-site/design/placeholders";
import { type Design, refsOf } from "@rsvp-site/design/schema";
import { FONT_FILES } from "./design-fonts.gen";
import { type DesignGuest, layoutDesignInvites } from "./design-pdf-core";
import { designSrc } from "./design-src";
import { bytes } from "./paper-pdf";
import type { PrintLayout } from "./paper-sizes";
import { scaleImage } from "./shrink-image";

export { download } from "./paper-pdf";

/**
 * An image as bytes pdf-lib can embed. JPEG and PNG go as they are; a
 * WebP is redrawn as a PNG, which keeps any transparency it had.
 */
async function imageBytes(ref: string): Promise<ArrayBuffer | null> {
	try {
		const blob = await (await fetch(designSrc(ref))).blob();
		if (blob.type === "image/jpeg" || blob.type === "image/png") {
			return blob.arrayBuffer();
		}
		const { blob: png } = await scaleImage(blob, { type: "image/png" });
		return png.arrayBuffer();
	} catch {
		return null;
	}
}

export async function buildDesignInvites(input: {
	design: Design;
	values: Values;
	guests: DesignGuest[];
	layout: PrintLayout;
	title: string;
}): Promise<Uint8Array> {
	const keys = facesOf(input.design);
	const refs = [...new Set(refsOf(input.design))];
	const [faces, fonts, images] = await Promise.all([
		loadFaces(keys),
		Promise.all(
			keys.map(async (k) => [k, await bytes(FONT_FILES[k].woff)] as const),
		),
		Promise.all(refs.map(async (r) => [r, await imageBytes(r)] as const)),
	]);
	return layoutDesignInvites({
		...input,
		assets: {
			faces,
			fonts: new Map(fonts),
			images: new Map(images.flatMap(([r, b]) => (b ? [[r, b] as const] : []))),
		},
	});
}
