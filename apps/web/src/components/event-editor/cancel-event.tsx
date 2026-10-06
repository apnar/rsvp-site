import { Textarea } from "@rsvp-site/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
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
	const [note, setNote] = useState("");
	const [notify, setNotify] = useState(true);
	const noteRef = useRef<HTMLTextAreaElement>(null);
	const noteId = `${label.replaceAll(" ", "-").toLowerCase()}-note`;
	return (
		<ConfirmAction
			trigger={{
				variant: "destructive",
				className: "mr-auto",
				children: label,
			}}
			title={question}
			confirm={confirm}
			cancel="Never mind"
			size="default"
			pending={pending}
			focusRef={noteRef}
			className="flex gap-2"
			onConfirm={() => onConfirm({ note, notify })}
		>
			<Field label="A note for your guests (optional)" htmlFor={noteId}>
				<Textarea
					ref={noteRef}
					id={noteId}
					value={note}
					maxLength={1000}
					onChange={(ev) => setNote(ev.target.value)}
				/>
			</Field>
			<Switch
				checked={notify}
				onChange={setNotify}
				className="w-fit text-[14px]"
			>
				Email the {plural(stillComing, "guest")} who haven't said no
			</Switch>
		</ConfirmAction>
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
				if (r.noticeFailed) {
					toast.warning("Canceled, but the message to guests didn't go.");
				} else {
					toast.success(
						r.notified > 0
							? `Canceled. Told ${plural(r.notified, "guest")}.`
							: "Canceled.",
					);
				}
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
