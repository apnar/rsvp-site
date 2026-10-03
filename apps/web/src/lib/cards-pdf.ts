/**
 * The one way a set of paper cards becomes a PDF, whichever page asks: the
 * guest list's download and the designer's preview. The builders behind it
 * (and with them pdf-lib) load only when it runs.
 */
import type { Values } from "@rsvp-site/design/placeholders";
import type { Design } from "@rsvp-site/design/schema";

import type { DesignGuest } from "./design-pdf-core";
import type { PaperEvent } from "./paper-pdf-core";
import {
	layoutsFor,
	PAPER_SIZES,
	type PaperSize,
	type PrintLayout,
} from "./paper-sizes";

/** A paper size for the classic card, a sheet layout for a designed one. */
export type Print = PaperSize | PrintLayout;

/** What the cards are drawn from: the host's design, or the classic card. */
export type CardsSource =
	| { design: Design; values: Values }
	| { design: null; event: PaperEvent };

export async function buildCardsPdf(input: {
	source: CardsSource;
	guests: DesignGuest[];
	print: Print;
	title: string;
}): Promise<Uint8Array> {
	// Only ever called from a click. Saying so lets the server build drop the
	// PDF libraries, which would otherwise ride along in the Worker for nothing.
	if (import.meta.env.SSR) throw new Error("PDFs are built in the browser.");
	const { source, guests, print, title } = input;
	if (source.design) {
		const { buildDesignInvites } = await import("./design-pdf");
		const layouts = layoutsFor(source.design.format);
		return buildDesignInvites({
			design: source.design,
			values: source.values,
			guests,
			layout:
				(layouts.find((l) => l.value === print) ?? layouts[0])?.value ??
				"exact",
			title,
		});
	}
	const { buildPaperInvites } = await import("./paper-pdf");
	return buildPaperInvites({
		event: source.event,
		guests,
		size: PAPER_SIZES.find((p) => p.value === print)?.value ?? "card",
	});
}
