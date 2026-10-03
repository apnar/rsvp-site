import type { DesignInput } from "../schema";

export type Placed = { ref: string; iw: number; ih: number };

/**
 * A picture a template brings with it, shipped with the site under
 * /templates/<template id>/<file>. Picking the template copies it into the
 * event's own design images, so the design only ever names those.
 */
export type TemplateAsset = { file: string; iw: number; ih: number };

export type TemplateContext = {
	/** The event's cover photo, copied into its design images. */
	cover: Placed | null;
	/** A paper event: the template brings its QR code and print lines. */
	paper: boolean;
	/** The template's own pictures, once copied into the event. */
	assets?: Record<string, Placed>;
};

export type Template = {
	id: string;
	label: string;
	assets?: Record<string, TemplateAsset>;
	build: (
		ctx: TemplateContext & { assets: Record<string, Placed> },
	) => DesignInput;
};
