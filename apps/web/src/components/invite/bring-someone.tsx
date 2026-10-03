import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { AnswerTag } from "@/components/response-bar";
import { plural } from "@/lib/format";
import { orpc } from "@/utils/orpc";
import type { Invite } from "./types";

/**
 * Inviting a friend, for guests the hosts chose, when the party allows it.
 * People a guest brings see none of this: they get their own plus-ones and
 * nothing more, which is what keeps the list from running away.
 */
export function BringSomeone({ data }: { data: Invite }) {
	const [email, setEmail] = useState("");
	const me = data.me;
	const invite = useMutation(
		orpc.guests.inviteFriend.mutationOptions({
			onSuccess: (r) => {
				toast.success(
					r.emailed
						? "Invited. They'll get an email from us."
						: "Added. They don't get email from us, so tell them yourself.",
				);
				setEmail("");
			},
		}),
	);
	const takeBack = useMutation(orpc.guests.uninviteFriend.mutationOptions());
	if (!me || (!me.canInvite && me.friends.length === 0)) return null;

	return (
		<section className="flex flex-col gap-3.5 rounded-[28px] border border-line border-dashed p-[clamp(20px,3vw,28px)]">
			<div>
				<span className="kicker text-pink-ink">Bring someone</span>
				<h2 className="mt-1.5 mb-0 text-[22px]">Know who'd love this?</h2>
			</div>
			{me.friends.length > 0 ? (
				<ul className="m-0 flex list-none flex-col gap-1 p-0">
					{me.friends.map((f) => (
						<li
							key={f.guestId}
							className="flex items-center gap-3 border-line border-t py-2.5 text-[15px]"
						>
							<span className="min-w-0 flex-1 truncate">
								<b>{f.name}</b>{" "}
								<span className="text-[13px] text-haze">{f.email}</span>
							</span>
							<AnswerTag response={f.response} />
							{f.response === null ? (
								<Button
									variant="ghost"
									size="xs"
									disabled={takeBack.isPending}
									onClick={() =>
										takeBack.mutate({
											eventId: data.event.id,
											guestId: f.guestId,
										})
									}
								>
									Take back
								</Button>
							) : null}
						</li>
					))}
				</ul>
			) : null}
			{me.canInvite && me.invitesLeft > 0 ? (
				<form
					className="flex flex-wrap gap-2"
					onSubmit={(ev) => {
						ev.preventDefault();
						invite.mutate({ eventId: data.event.id, email });
					}}
				>
					<label htmlFor="friend-email" className="sr-only">
						Their email
					</label>
					<Input
						id="friend-email"
						type="email"
						required
						placeholder="Their email"
						value={email}
						onChange={(ev) => setEmail(ev.target.value)}
						className="min-w-0 flex-[1_1_200px]"
					/>
					<Button type="submit" variant="light" disabled={invite.isPending}>
						{invite.isPending ? "Inviting..." : "Invite"}
					</Button>
				</form>
			) : null}
			<p className="m-0 text-[13px] text-haze">
				{me.canInvite
					? me.invitesLeft > 0
						? `You can invite ${plural(me.invitesLeft, "more person", "more people")}. They get their own invitation and can bring their own plus-ones, but can't invite anyone else.`
						: `That's everyone you can invite to this one (${data.event.guestInviteLimit}).`
					: "The hosts aren't taking more guests right now."}
			</p>
		</section>
	);
}
