import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { orpc } from "@/utils/orpc";

/** Give a name-only paper guest an address, so email can reach them later. */
export function AddEmail({
	eventId,
	guestId,
}: {
	eventId: string;
	guestId: string;
}) {
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const save = useMutation(
		orpc.guests.setEmail.mutationOptions({
			onSuccess: () => setOpen(false),
		}),
	);
	if (!open) {
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-lime-ink hover:text-lime-soft"
			>
				+ Add email
			</button>
		);
	}
	return (
		<form
			className="mt-1.5 flex gap-1.5"
			onSubmit={(ev) => {
				ev.preventDefault();
				save.mutate({ eventId, guestId, email });
			}}
		>
			<Input
				type="email"
				required
				autoFocus
				aria-label="Their email"
				value={email}
				onChange={(ev) => setEmail(ev.target.value)}
				className="min-h-9 rounded-full px-3 py-1.5 text-[14px]"
			/>
			<Button type="submit" size="sm" disabled={save.isPending}>
				Save
			</Button>
		</form>
	);
}
