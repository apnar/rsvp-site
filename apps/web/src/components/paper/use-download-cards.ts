import { useMutation } from "@tanstack/react-query";

import { buildCardsPdf, type Print } from "@/lib/cards-pdf";
import { messageOf } from "@/lib/errors";
import { download } from "@/lib/pdf-io";
import { client } from "@/utils/orpc";

/**
 * Fetch the cards' data (issuing any missing codes), build the PDF in the
 * browser, and save it. One guest, or everybody. A mutation rather than a
 * bare call because it writes -- the codes -- so the lists behind it
 * refresh, and the mutation cache says so when it fails.
 */
export function useDownloadCards() {
	return useMutation({
		mutationFn: async (input: {
			eventId: string;
			title: string;
			print: Print;
			guest: { id: string; name: string } | null;
		}) => {
			// Only ever run from a click. Saying so lets the server build drop the
			// PDF library, which would otherwise ride along in the Worker for nothing.
			if (import.meta.env.SSR) return;
			const { eventId, title, print, guest } = input;
			try {
				const data = await client.events.paperInvites({
					eventId,
					guestIds: guest ? [guest.id] : undefined,
				});
				if (data.guests.length === 0)
					throw new Error("Nobody on the list yet.");
				const file = await buildCardsPdf({
					source: data.design
						? { design: data.design.doc, values: data.values }
						: { design: null, event: data.event },
					guests: data.guests,
					print,
					title: data.event.title,
				});
				download(
					file,
					guest ? `${title} - ${guest.name}.pdf` : `${title} - invitations.pdf`,
				);
			} catch (error) {
				throw new Error(messageOf(error) || "The PDF didn't build.");
			}
		},
	});
}
