/**
 * Loading font metrics. Each face is its own module, imported on demand,
 * so a page pays only for the fonts its design uses.
 */
import {
	type FaceKey,
	FONTS,
	type FontId,
	faceKey,
	nearestWeight,
} from "./fonts";
import { METRICS } from "./metrics/index";
import { type Face, prepareFace } from "./text";

export type Faces = ReadonlyMap<FaceKey, Face>;

/** The faces a set of text elements and a theme need. */
export function facesOf(d: {
	elements: readonly { type: string; font?: FontId; weight?: number }[];
}): FaceKey[] {
	const keys = new Set<FaceKey>();
	for (const el of d.elements) {
		if (el.type === "text" && el.font) {
			keys.add(faceKey(el.font, nearestWeight(el.font, el.weight ?? 400)));
		}
	}
	return [...keys];
}

/** Every face of every font: what the designer's font picker needs. */
export function allFaces(): FaceKey[] {
	return (Object.keys(FONTS) as FontId[]).flatMap((id) =>
		FONTS[id].weights.map((w) => faceKey(id, w)),
	);
}

export async function loadFaces(keys: Iterable<FaceKey>): Promise<Faces> {
	const out = new Map<FaceKey, Face>();
	await Promise.all(
		[...new Set(keys)].map(async (key) => {
			const load = METRICS[key];
			if (!load) return;
			out.set(key, prepareFace((await load()).default));
		}),
	);
	return out;
}
