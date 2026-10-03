import { Button } from "@rsvp-site/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import type { Guest } from "@/components/guest-list/types";
import type { Print } from "@/lib/cards-pdf";
import { orpc } from "@/utils/orpc";
import { useDownloadCards } from "./use-download-cards";

/** One guest's card, and a fresh code when theirs got lost. */
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
	const fresh = useMutation(
		orpc.guests.newPaperCode.mutationOptions({
			onSuccess: () => {
				toast.success(
					`New code for ${guest.name}. Their old card no longer works; download the new one.`,
				);
			},
		}),
	);
	return (
		<>
			<Button
				variant="outline"
				size="sm"
				disabled={card.isPending}
				onClick={() =>
					card.mutate({ eventId, title: eventTitle, print, guest })
				}
			>
				Card
			</Button>
			{guest.hasPaper ? (
				<Button
					variant="ghost"
					size="xs"
					disabled={fresh.isPending}
					onClick={() => fresh.mutate({ eventId, guestId: guest.id })}
				>
					New code
				</Button>
			) : null}
		</>
	);
}
