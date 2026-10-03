import { Button } from "@rsvp-site/ui/components/button";
import { Textarea } from "@rsvp-site/ui/components/textarea";
import { cn } from "@rsvp-site/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { plural } from "@/lib/format";
import { orpc } from "@/utils/orpc";

/** Contact groups as toggle chips: "King Farm Swim Team · 64". */
export function GroupChips({
	selected,
	onToggle,
}: {
	selected: string[];
	onToggle: (id: string) => void;
}) {
	const groups = useQuery(orpc.contacts.list.queryOptions());
	if (!groups.data) return null;
	if (groups.data.length === 0) {
		return (
			<span className="text-[13px] text-haze">
				No contact groups yet. <Link to="/contacts">Make one</Link> to invite
				the same crowd again in one tap.
			</span>
		);
	}
	return (
		<div className="flex flex-wrap gap-2">
			{groups.data.map((g) => {
				const on = selected.includes(g.id);
				return (
					<button
						key={g.id}
						type="button"
						aria-pressed={on}
						onClick={() => onToggle(g.id)}
						className={cn(
							"inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 font-bold text-[14px] transition-colors",
							on
								? "border-lime bg-lime/14 text-ink"
								: "border-line-strong text-soft hover:border-haze hover:text-ink",
						)}
					>
						{g.name} · {g.members.length}
						{on ? <span className="text-haze">×</span> : null}
					</button>
				);
			})}
		</div>
	);
}

/**
 * Put more people on an event's list: typed or pasted addresses, and whole
 * contact groups. Nobody is emailed here; the page offers to send after.
 */
export function AddGuests({
	eventId,
	published,
	paper = false,
	onAdded,
}: {
	eventId: string;
	published: boolean;
	/** Paper events also take bare names, one per line. */
	paper?: boolean;
	onAdded: () => void;
}) {
	const [emails, setEmails] = useState("");
	const [groupIds, setGroupIds] = useState<string[]>([]);

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
				setEmails("");
				setGroupIds([]);
				onAdded();
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);

	return (
		<form
			className="flex flex-col gap-3.5 rounded-[26px] bg-panel p-[clamp(18px,3vw,28px)]"
			onSubmit={(ev) => {
				ev.preventDefault();
				add.mutate({ eventId, emails, groupIds });
			}}
		>
			<h2 className="m-0 text-[20px]">Invite more</h2>
			<GroupChips
				selected={groupIds}
				onToggle={(id) =>
					setGroupIds((ids) =>
						ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
					)
				}
			/>
			<label htmlFor="add-emails" className="sr-only">
				Email addresses
			</label>
			<Textarea
				id="add-emails"
				value={emails}
				placeholder={
					paper
						? "One per line: an email, or just a name for a card-only guest"
						: "Paste or type emails, separated by commas or new lines"
				}
				onChange={(ev) => setEmails(ev.target.value)}
			/>
			<div className="flex flex-wrap items-center gap-3">
				<Button
					type="submit"
					variant="light"
					disabled={add.isPending || (!emails.trim() && groupIds.length === 0)}
				>
					Add
				</Button>
				<span className="text-[13px] text-haze">
					Guests sign in with their email to RSVP, so every answer has a name on
					it.
				</span>
			</div>
		</form>
	);
}
