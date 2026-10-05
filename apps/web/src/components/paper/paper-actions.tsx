import { Button } from "@rsvp-site/ui/components/button";
import type { Guest } from "@/components/guest-list/types";
import type { Print } from "@/lib/cards-pdf";
import { useDownloadCards } from "./use-download-cards";

/** One guest's card, to print or send again. */
export function PaperActions({
	eventId,
	eventTitle,
	print,
	guest,
}: {
	eventId: string;
	eventTitle: string;
	print: Print;
	guest: Guest;
}) {
	const card = useDownloadCards();
	return (
		<Button
			variant="outline"
			size="sm"
			disabled={card.isPending}
			onClick={() => card.mutate({ eventId, title: eventTitle, print, guest })}
		>
			Card
		</Button>
	);
}
