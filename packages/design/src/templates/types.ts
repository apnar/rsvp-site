import type { DesignInput } from "../schema";

export type TemplateContext = {
	/** The event's cover photo, copied into its design images. */
	cover: { ref: string; iw: number; ih: number } | null;
	/** A paper event: the template brings its QR code and print lines. */
	paper: boolean;
};

export type Template = {
	id: string;
	label: string;
	build: (ctx: TemplateContext) => DesignInput;
};
