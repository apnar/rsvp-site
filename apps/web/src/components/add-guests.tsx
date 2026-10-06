import { Button } from "@rsvp-site/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { plural } from "@/lib/format";
import { orpc } from "@/utils/orpc";

import {
	type GuestPick,
	GuestPicker,
	hasPick,
	NO_PICK,
	textsUnconfirmed,
} from "./guest-picker";
import { Panel } from "./page";

/**
 * Put more people on an event's list: typed or pasted addresses, and whole
 * contact groups. Nobody is emailed here; the page offers to send after.
 */
export function AddGuests({
	eventId,
	published,
	paper = false,
	onList,
}: {
	eventId: string;
	published: boolean;
	/** Paper events also take bare names, one per line. */
	paper?: boolean;
	/** Who is already on the list, left out of the address-book picker. */
	onList?: ReadonlySet<string>;
}) {
	const [pick, setPick] = useState<GuestPick>(NO_PICK);

	const add = useMutation(
		orpc.guests.add.mutationOptions({
			onSuccess: (r) => {
				if (r.invalid) {
					toast.error(
						paper
							? "Nothing to add there."
							: "Those don't look like email addresses.",
					);
					return;
				}
				const parts = [
					`Added ${plural(r.added, "guest")}`,
					r.already ? `${r.already} already on the list` : "",
					r.refused ? `${r.refused} can't be invited` : "",
				].filter(Boolean);
				toast.success(
					`${parts.join(", ")}.${published && r.added > 0 && !paper ? " Send when you're ready." : ""}`,
				);
				setPick(NO_PICK);
			},
		}),
	);

	return (
		<Panel
			title="Invite more"
			as="form"
			className="gap-3.5"
			onSubmit={(ev) => {
				ev.preventDefault();
				add.mutate({
					eventId,
					emails: pick.emails,
					userIds: pick.userIds,
					textsOk: pick.textsOk,
				});
			}}
		>
			<GuestPicker
				value={pick}
				onChange={setPick}
				paper={paper}
				exclude={onList}
			/>
			<div>
				<Button
					type="submit"
					variant="light"
					disabled={
						add.isPending || !hasPick(pick) || textsUnconfirmed(pick, paper)
					}
				>
					Add
				</Button>
			</div>
		</Panel>
	);
}
