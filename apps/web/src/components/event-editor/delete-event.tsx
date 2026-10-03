import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { plural } from "@/lib/format";
import { orpc } from "@/utils/orpc";

import { CallOff } from "./cancel-event";

/**
 * Erase an event. One guests are still expecting asks for the cancellation
 * note first, since the server cancels it before deleting; anything else
 * (a draft, a canceled or past event) is a plain "are you sure?".
 */
export function DeleteEvent({
	eventId,
	status,
	expectingGuests,
	stillComing,
}: {
	eventId: string;
	status: "draft" | "published" | "canceled";
	expectingGuests: boolean;
	stillComing: number;
}) {
	const navigate = useNavigate();
	const draft = status === "draft";
	const remove = useMutation(
		orpc.events.remove.mutationOptions({
			onSuccess: (r) => {
				toast.success(
					draft
						? "Draft deleted."
						: r.notified > 0
							? `Deleted. Told ${plural(r.notified, "guest")} it's off.`
							: "Deleted.",
				);
				navigate({ to: "/events" });
			},
		}),
	);
	if (expectingGuests) {
		return (
			<CallOff
				label="Delete event"
				question="Delete this event? It's canceled first, then the guest list and every answer are gone for good."
				confirm="Yes, delete it"
				stillComing={stillComing}
				pending={remove.isPending}
				onConfirm={(input) => remove.mutate({ eventId, ...input })}
			/>
		);
	}
	return (
		<ConfirmAction
			size="default"
			confirm={draft ? "Delete it" : "Delete it for good"}
			pending={remove.isPending}
			onConfirm={() => remove.mutate({ eventId })}
			trigger={{
				variant: "destructive",
				className: "mr-auto",
				children: draft ? "Delete draft" : "Delete event",
			}}
			className="mr-auto flex gap-2"
		/>
	);
}
