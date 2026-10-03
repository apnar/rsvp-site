import type { TemplateAsset } from "./types";

/**
 * The pictures each template ships with, as data only: the page's
 * designSrc needs to map a stand-in ref to its file without importing
 * the templates (and their stickers) themselves.
 */
export const TEMPLATE_ASSETS: Record<string, Record<string, TemplateAsset>> = {
	"night-society": {
		paper: { file: "paper.jpg", iw: 1080, ih: 1350 },
		glow: { file: "glow.png", iw: 400, ih: 400 },
		moon: { file: "moon.png", iw: 224, ih: 224 },
		cloudsLeft: { file: "clouds-left.png", iw: 392, ih: 184 },
		cloudsRight: { file: "clouds-right.png", iw: 428, ih: 193 },
		goose: { file: "goose.png", iw: 116, ih: 102 },
		geese: { file: "geese.png", iw: 324, ih: 196 },
	},
};
