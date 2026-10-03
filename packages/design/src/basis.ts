/**
 * What a card image was drawn from. The shared JPEG bakes in the event's
 * facts, so it goes stale when the date moves; comparing the stored basis
 * with the current one is how a page notices and draws it again.
 */
import type { Values } from "./placeholders";

/** FNV-1a, 32 bits: a fingerprint, not a secret. */
function fnv(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(36);
}

export function basisOf(version: number, values: Values): string {
	const { guest: _, ...facts } = values;
	return `${version}.${fnv(JSON.stringify(facts))}`;
}
