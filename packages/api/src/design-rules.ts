import { ORPCError } from "@orpc/server";
import { hasPrintableQr } from "@rsvp-site/design/qr";
import type { Design } from "@rsvp-site/design/schema";

import type { EventRow } from "./events";

/** A paper event's guests answer by scanning; its card can't lack the code. */
export function needsQr(
	row: Pick<EventRow, "paper">,
	designOn: boolean,
	doc: Pick<Design, "format" | "elements"> | null,
) {
	// A hidden, invisible or off-card code prints nothing to scan.
	if (row.paper && designOn && !(doc && hasPrintableQr(doc))) {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"This is a paper invitation: add a QR code to the design so guests can scan it to answer.",
		});
	}
}
