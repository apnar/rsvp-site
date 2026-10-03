/**
 * Loading font metrics. Each face is its own module, imported on demand,
 * so a page pays only for the fonts its design uses.
 */
import { FACES, type FaceKey, type FontId, faceFor } from "./fonts";
import { METRICS } from "./metrics/index";
import { type Face, prepareFace } from "./text";

export type Faces = ReadonlyMap<FaceKey, Face>;

/** The faces a set of text elements and a theme need. */
export function facesOf(d: {
	elements: readonly {
		type: string;
		font?: FontId;
		weight?: number;
		italic?: boolean;
	}[];
}): FaceKey[] {
	const keys = new Set<FaceKey>();
	for (const el of d.elements) {
		if (el.type === "text" && el.font) {
			keys.add(faceFor(el.font, el.weight ?? 400, Boolean(el.italic)).key);
		}
	}
	return [...keys];
}

/** Every face of every font: what the designer's font picker needs. */
export function allFaces(): FaceKey[] {
	return [...FACES];
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
