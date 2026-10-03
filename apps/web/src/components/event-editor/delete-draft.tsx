import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { orpc } from "@/utils/orpc";

export function DeleteDraft({ eventId }: { eventId: string }) {
	const navigate = useNavigate();
	const remove = useMutation(
		orpc.events.remove.mutationOptions({
			onSuccess: () => {
				toast.success("Draft deleted.");
				navigate({ to: "/events" });
			},
		}),
	);
	return (
		<ConfirmAction
			size="default"
			confirm="Delete it"
			pending={remove.isPending}
			onConfirm={() => remove.mutate({ eventId })}
			trigger={{
				variant: "ghost",
				className: "mr-auto",
				children: "Delete draft",
			}}
			className="flex gap-2"
		/>
	);
}
