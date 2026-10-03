import { Button } from "@rsvp-site/ui/components/button";
import { Textarea } from "@rsvp-site/ui/components/textarea";
import { cn } from "@rsvp-site/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Field, Switch } from "@/components/controls";
import { plural } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export function CancelEvent({
	eventId,
	stillComing,
}: {
	eventId: string;
	stillComing: number;
}) {
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [note, setNote] = useState("");
	const [notify, setNotify] = useState(true);
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
	if (!open) {
		return (
			<Button
				variant="destructive"
				className="mr-auto"
				onClick={() => setOpen(true)}
			>
				Cancel event
			</Button>
		);
	}
	return (
		<div
			className={cn(
				"flex basis-full flex-col gap-3 rounded-[20px] border border-destructive/50 p-4",
			)}
		>
			<b>Cancel this event?</b>
			<Field label="A note for your guests (optional)" htmlFor="cancel-note">
				<Textarea
					id="cancel-note"
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
					disabled={cancel.isPending}
					onClick={() => cancel.mutate({ eventId, note, notify })}
				>
					Yes, cancel it
				</Button>
				<Button variant="ghost" onClick={() => setOpen(false)}>
					Never mind
				</Button>
			</div>
		</div>
	);
}
