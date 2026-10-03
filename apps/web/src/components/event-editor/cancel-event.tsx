import { Button } from "@rsvp-site/ui/components/button";
import { Textarea } from "@rsvp-site/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Field, Switch } from "@/components/controls";
import { plural } from "@/lib/format";
import { orpc } from "@/utils/orpc";

/**
 * A button that opens the "tell the guests it's off" form: a note and
 * whether to email it. Canceling uses it, and so does deleting an event
 * guests are still expecting, which cancels it first.
 */
export function CallOff({
	label,
	question,
	confirm,
	stillComing,
	pending,
	onConfirm,
}: {
	label: string;
	question: string;
	confirm: string;
	stillComing: number;
	pending: boolean;
	onConfirm: (input: { note: string; notify: boolean }) => void;
}) {
	const [open, setOpen] = useState(false);
	const [note, setNote] = useState("");
	const [notify, setNotify] = useState(true);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const noteRef = useRef<HTMLTextAreaElement>(null);
	const wasOpen = useRef(false);
	// Focus follows the swap, as in ConfirmAction: a keyboard user is never
	// left on a button that has just vanished.
	useEffect(() => {
		if (open) noteRef.current?.focus();
		else if (wasOpen.current) triggerRef.current?.focus();
		wasOpen.current = open;
	}, [open]);
	if (!open) {
		return (
			<Button
				ref={triggerRef}
				variant="destructive"
				className="mr-auto"
				onClick={() => setOpen(true)}
			>
				{label}
			</Button>
		);
	}
	const noteId = `${label.replaceAll(" ", "-").toLowerCase()}-note`;
	return (
		<div className="flex basis-full flex-col gap-3 rounded-[20px] border border-destructive/50 p-4">
			<b>{question}</b>
			<Field label="A note for your guests (optional)" htmlFor={noteId}>
				<Textarea
					ref={noteRef}
					id={noteId}
					value={note}
					maxLength={1000}
					onChange={(ev) => setNote(ev.target.value)}
				/>
			</Field>
			<div className="flex items-center gap-3 text-[14px]">
				<Switch
					label="Email the guests"
					checked={notify}
					onChange={setNotify}
				/>
				Email the {plural(stillComing, "guest")} who haven't said no
			</div>
			<div className="flex gap-2">
				<Button
					variant="destructive"
					disabled={pending}
					onClick={() => onConfirm({ note, notify })}
				>
					{confirm}
				</Button>
				<Button variant="ghost" onClick={() => setOpen(false)}>
					Never mind
				</Button>
			</div>
		</div>
	);
}

export function CancelEvent({
	eventId,
	stillComing,
}: {
	eventId: string;
	stillComing: number;
}) {
	const navigate = useNavigate();
	const cancel = useMutation(
		orpc.events.cancel.mutationOptions({
			onSuccess: (r) => {
				toast.success(
					r.notified > 0
						? `Canceled. Told ${plural(r.notified, "guest")}.`
						: "Canceled.",
				);
				navigate({ to: "/events" });
			},
		}),
	);
	return (
		<CallOff
			label="Cancel event"
			question="Cancel this event?"
			confirm="Yes, cancel it"
			stillComing={stillComing}
			pending={cancel.isPending}
			onConfirm={(input) => cancel.mutate({ eventId, ...input })}
		/>
	);
}
