import { Button } from "@rsvp-site/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import type { ListEvent } from "@/components/guest-list/types";
import { Panel } from "@/components/page";
import { DRY_RUN_SUFFIX } from "@/content/site";
import type { Print } from "@/lib/cards-pdf";
import { plural, shortDate } from "@/lib/format";
import { orpc } from "@/utils/orpc";
import { PrintSelect } from "./print-select";
import { useDownloadCards } from "./use-download-cards";
import { printOptions } from "./use-print";

/**
 * The paper side of an event: pick a size, download everybody's card in one
 * PDF, and -- once they have had time to arrive -- start the emails.
 */
export function PaperPanel({
	event,
	emailable,
	print,
	onPrint,
}: {
	event: ListEvent;
	/** Guests the first email would reach. */
	emailable: number;
	print: Print;
	onPrint: (value: Print) => void;
}) {
	const published = event.status === "published";
	const held = event.emailsHeld;
	const cards = useDownloadCards();
	const release = useMutation(
		orpc.events.releaseEmails.mutationOptions({
			onSuccess: (r) => {
				toast.success(
					`Emails started. Sent ${plural(r.sent, "invitation")}.${r.dryRun ? DRY_RUN_SUFFIX : ""}`,
				);
			},
		}),
	);
	return (
		<Panel className="gap-3.5 border border-lime/60">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h2 className="m-0 text-[20px]">Paper invitations</h2>
				<span className="text-[13px] text-haze">
					{held
						? "Emails are on hold, so the cards arrive first."
						: event.emailsReleasedAt
							? `Emails started ${shortDate(event.emailsReleasedAt)}.`
							: ""}
				</span>
			</div>
			<p className="m-0 text-[14px] text-soft">
				Each card has a QR code that signs that guest in to answer.
				{published ? "" : " The codes start working when you publish."}
			</p>
			<div className="flex flex-wrap items-center gap-2">
				<PrintSelect
					value={print}
					options={printOptions(event.designFormat)}
					onChange={onPrint}
				/>
				<Button
					variant="light"
					disabled={cards.isPending}
					onClick={() =>
						cards.mutate({
							eventId: event.id,
							title: event.title,
							print,
							guest: null,
						})
					}
				>
					{cards.isPending ? "Making the PDF..." : "Download all (PDF)"}
				</Button>
				{published && held ? (
					<ConfirmAction
						size="default"
						confirmVariant="send"
						confirm={`Yes, email ${plural(emailable, "guest")}`}
						cancel="Not yet"
						pending={release.isPending}
						onConfirm={(close) =>
							release.mutate({ eventId: event.id }, { onSuccess: close })
						}
						trigger={{ variant: "send", children: "Start emails" }}
					/>
				) : null}
			</div>
			{published && held ? (
				<span className="text-[13px] text-haze">
					Starting emails sends the invitation to everyone with an address who
					hasn't answered from their card yet, then reminders and updates run as
					usual. Guests a guest invites get email straight away; they have no
					card.
				</span>
			) : null}
		</Panel>
	);
}
