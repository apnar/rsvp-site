import type { Design } from "@rsvp-site/design/schema";

/**
 * The designer's document state lives in @rsvp-site/design/editor (pure,
 * and tested there). This file is the import path the screens use.
 */
export * from "@rsvp-site/design/editor";
export { elementLabel } from "@rsvp-site/design/label";

/** How a screen hands the designer a changed document; the key merges a run of one edit into one undo step. */
export type SetDoc = (doc: Design, key?: string) => void;

export type ImageTray = {
	images: string[];
	upload: (
		file: File,
	) => Promise<{ ref: string; iw: number; ih: number } | null>;
	sizeOf: (ref: string) => Promise<{ iw: number; ih: number }>;
	busy: boolean;
};
