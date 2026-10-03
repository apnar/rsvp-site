import { type Design, design } from "../schema";
import { afterDark } from "./after-dark";
import { confetti } from "./confetti";
import { disco } from "./disco";
import { garden } from "./garden";
import { minimal } from "./minimal";
import { nightSociety } from "./night-society";
import { poster } from "./poster";
import { previewAssetsOf, templateAssetUrl } from "./preview-refs";
import type { Placed, Template, TemplateContext } from "./types";

export type { Placed, Template, TemplateAsset, TemplateContext } from "./types";

export const TEMPLATES: Template[] = [
	afterDark,
	garden,
	confetti,
	minimal,
	disco,
	poster,
	nightSociety,
];

export function previewAssets(t: Template): Record<string, Placed> {
	return previewAssetsOf(t.id);
}

export { templateAssetUrl };

/** A template made into a design, parsed so its defaults are filled in. */
export function fromTemplate(t: Template, ctx: TemplateContext): Design {
	return design.parse(
		t.build({ ...ctx, assets: ctx.assets ?? previewAssets(t) }),
	);
}
