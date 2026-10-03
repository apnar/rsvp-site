import { templateAssetUrl } from "@rsvp-site/design/templates/preview-refs";

/**
 * The public address of a design image or card (designs/<id>/<name>), or,
 * for a template not yet picked, of the picture it ships with. Kept out of
 * format.ts so the pages that never draw a design do not bundle every
 * template and sticker for it.
 */
export function designSrc(ref: string): string {
	return templateAssetUrl(ref) ?? `/api/${ref}`;
}
