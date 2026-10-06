import { Button } from "@rsvp-site/ui/components/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import { orpc } from "@/utils/orpc";

/**
 * Delete somebody for good. Opening it asks the server what happens to the
 * events they own, so the admin sees which pass to a co-host and which go
 * with them before saying yes, and why it is refused when it would be.
 */
export function DeletePerson({
	person,
}: {
	person: { id: string; name: string };
}) {
	const [open, setOpen] = useState(false);
	const plan = useQuery({
		...orpc.people.removal.queryOptions({ input: { userId: person.id } }),
		enabled: open,
	});
	const remove = useMutation(
		orpc.people.remove.mutationOptions({
			onSuccess: () => toast.success(`${person.name} is deleted.`),
		}),
	);
	const p = plan.data;
	return (
		<ConfirmAction
			trigger={{ variant: "ghost", size: "sm", children: "Delete" }}
			title={`Delete ${person.name} for good?`}
			confirm="Delete them"
			cancel="Keep"
			boxClassName="flex basis-full flex-col gap-2.5 rounded-[20px] border border-destructive/50 p-4 text-[14px]"
			confirmDisabled={!p || p.blocking.length > 0}
			pending={remove.isPending}
			onOpenChange={setOpen}
			onConfirm={() => remove.mutate({ userId: person.id })}
		>
			<span className="text-soft">
				Their invitations, answers, family and address-book entries go too.
				Deactivating keeps all that and only shuts them out.
			</span>
			{p ? (
				<>
					{p.handOff.length > 0 ? (
						<span>
							Passes to a co-host:{" "}
							{p.handOff.map((h) => `${h.title} (${h.to})`).join(", ")}
						</span>
					) : null}
					{p.erase.length > 0 ? (
						<span>Deleted with them: {p.erase.join(", ")}</span>
					) : null}
					{p.blocking.length > 0 ? (
						<span className="text-destructive">
							Guests are still expecting {p.blocking.join(", ")}. Cancel it or
							add a co-host first.
						</span>
					) : null}
				</>
			) : plan.isError ? (
				<span className="flex items-center gap-2 text-destructive">
					Couldn't check their events.
					<Button variant="outline" size="sm" onClick={() => plan.refetch()}>
						Retry
					</Button>
				</span>
			) : (
				<span className="text-haze">Checking their events…</span>
			)}
		</ConfirmAction>
	);
}
