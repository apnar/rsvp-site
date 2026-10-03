import { eventDesign } from "@rsvp-site/db/schema/event";
import {
	type Design,
	type DesignTheme,
	parseDesign,
	theme,
} from "@rsvp-site/design/schema";
import { eq } from "drizzle-orm";

import type { Context } from "./context";

type Db = Context["db"];

/**
 * A stored document, checked again on the way out. Saves validate, but
 * the column is JSON and an old shape or a hand-edited row would otherwise
 * reach the layout and the PDF unchecked. Null when it no longer parses.
 */
export function readDesign(raw: unknown): Design | null {
	if (raw == null) return null;
	const parsed = parseDesign(raw);
	return parsed.ok ? parsed.design : null;
}

/** The saved design and its version, parsed. */
export async function savedDesign(
	db: Db,
	eventId: string,
): Promise<{ doc: Design | null; version: number } | null> {
	const saved = await db
		.select({ doc: eventDesign.doc, version: eventDesign.version })
		.from(eventDesign)
		.where(eq(eventDesign.eventId, eventId))
		.get();
	return saved ? { doc: readDesign(saved.doc), version: saved.version } : null;
}

/**
 * The page theme copied onto the event. It reaches a raw <style> and email
 * HTML, so a value that is not exactly a theme is treated as no theme.
 */
export function readTheme(raw: unknown): DesignTheme | null {
	if (raw == null) return null;
	const parsed = theme.safeParse(raw);
	return parsed.success ? parsed.data : null;
}
