import { type Design, design } from "../schema";
import { afterDark } from "./after-dark";
import { confetti } from "./confetti";
import { disco } from "./disco";
import { garden } from "./garden";
import { minimal } from "./minimal";
import { nightSociety } from "./night-society";
import { poster } from "./poster";
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

/**
 * Before a template is picked its pictures have no place in any event.
 * These stand-in refs (under an event id nothing has) let it be laid out
 * and previewed anyway; `templateAssetUrl` says where each one really is.
 */
const PREVIEW_EVENT = "00000000-0000-4000-8000-000000000000";
const previews = new Map<string, string>();

export function previewAssets(t: Template): Record<string, Placed> {
	const out: Record<string, Placed> = {};
	const ti = TEMPLATES.indexOf(t);
	Object.entries(t.assets ?? {}).forEach(([name, a], ai) => {
		const ext = a.file.split(".").pop() ?? "png";
		const id = `00000000-0000-4000-8000-${(ti * 100 + ai).toString(16).padStart(12, "0")}`;
		const ref = `designs/${PREVIEW_EVENT}/${id}.${ext}`;
		previews.set(ref, `/templates/${t.id}/${a.file}`);
		out[name] = { ref, iw: a.iw, ih: a.ih };
	});
	return out;
}

/** The site path of a stand-in ref, or null for a real one. */
export function templateAssetUrl(ref: string): string | null {
	if (previews.size === 0) for (const t of TEMPLATES) previewAssets(t);
	return previews.get(ref) ?? null;
}

/** A template made into a design, parsed so its defaults are filled in. */
export function fromTemplate(t: Template, ctx: TemplateContext): Design {
	return design.parse(
		t.build({ ...ctx, assets: ctx.assets ?? previewAssets(t) }),
	);
}
