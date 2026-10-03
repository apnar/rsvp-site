import { TEMPLATE_ASSETS } from "./assets";
import type { Placed } from "./types";

/**
 * Before a template is picked its pictures have no place in any event.
 * These stand-in refs (under an event id nothing has) let it be laid out
 * and previewed anyway; \`templateAssetUrl\` says where each one really is.
 */
const PREVIEW_EVENT = "00000000-0000-4000-8000-000000000000";
const ids = Object.keys(TEMPLATE_ASSETS);
const previews = new Map<string, string>();
const placed = new Map<string, Record<string, Placed>>();

for (const [ti, templateId] of ids.entries()) {
	const out: Record<string, Placed> = {};
	Object.entries(TEMPLATE_ASSETS[templateId] ?? {}).forEach(([name, a], ai) => {
		const ext = a.file.split(".").pop() ?? "png";
		const id = `00000000-0000-4000-8000-${(ti * 100 + ai).toString(16).padStart(12, "0")}`;
		const ref = `designs/${PREVIEW_EVENT}/${id}.${ext}`;
		previews.set(ref, `/templates/${templateId}/${a.file}`);
		out[name] = { ref, iw: a.iw, ih: a.ih };
	});
	placed.set(templateId, out);
}

/** The stand-in pictures of a template, by name. */
export function previewAssetsOf(templateId: string): Record<string, Placed> {
	return placed.get(templateId) ?? {};
}

/** The site path of a stand-in ref, or null for a real one. */
export function templateAssetUrl(ref: string): string | null {
	return previews.get(ref) ?? null;
}
