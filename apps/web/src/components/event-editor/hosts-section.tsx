import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { StepHeading } from "@/components/controls";
import { Panel } from "@/components/page";
import { orpc } from "@/utils/orpc";

import type { Loaded } from "./form";

/**
 * Who runs the event. Co-hosts can edit it, see the whole guest list and
 * send for it; they must be hosts on the site, which is an admin's call, so
 * the suggestions are the hosts in the caller's address book. On a new
 * event the addresses wait in `pending` until the draft is saved.
 */
export function HostsSection({
	loaded,
	pending,
	onPendingChange,
}: {
	loaded?: Loaded;
	pending: string[];
	onPendingChange: (emails: string[]) => void;
}) {
	const book = useQuery(orpc.contacts.book.queryOptions());
	const [email, setEmail] = useState("");
	const add = useMutation(
		orpc.events.addCohost.mutationOptions({
			onSuccess: () => setEmail(""),
		}),
	);
	const remove = useMutation(orpc.events.removeCohost.mutationOptions());
	const hostEmails = new Set(loaded?.hosts.map((h) => h.email) ?? []);
	const suggestions = (book.data?.people ?? []).filter(
		(p) =>
			p.canHost &&
			p.email &&
			!hostEmails.has(p.email) &&
			!pending.includes(p.email),
	);
	const addEmail = (value: string) => {
		const clean = value.trim().toLowerCase();
		if (!clean) return;
		if (loaded) add.mutate({ eventId: loaded.event.id, email: clean });
		else {
			if (!pending.includes(clean)) onPendingChange([...pending, clean]);
			setEmail("");
		}
	};
	const chip =
		"inline-flex items-center gap-2 rounded-full border border-line-strong px-3.5 py-2 text-[14px]";

	return (
		<Panel className="gap-3.5">
			<StepHeading n={2} title="Hosts" />
			<div className="flex flex-wrap gap-2">
				{loaded ? (
					loaded.hosts.map((h) => (
						<span key={h.id} className={chip}>
							{h.name}
							{h.isOwner ? (
								<span className="text-haze">owner</span>
							) : (
								<button
									type="button"
									aria-label={`Remove ${h.name} as a host`}
									className="cursor-pointer border-0 bg-transparent text-haze hover:text-ink"
									onClick={() =>
										remove.mutate({ eventId: loaded.event.id, userId: h.id })
									}
								>
									×
								</button>
							)}
						</span>
					))
				) : (
					<span className={chip}>
						You <span className="text-haze">owner</span>
					</span>
				)}
				{pending.map((p) => (
					<span key={p} className={chip}>
						{p}
						<button
							type="button"
							aria-label={`Don't add ${p}`}
							className="cursor-pointer border-0 bg-transparent text-haze hover:text-ink"
							onClick={() => onPendingChange(pending.filter((x) => x !== p))}
						>
							×
						</button>
					</span>
				))}
			</div>
			{suggestions.length > 0 ? (
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="text-[13px] text-haze">Hosts you know:</span>
					{suggestions.slice(0, 8).map((p) => (
						<button
							key={p.userId}
							type="button"
							onClick={() => addEmail(p.email)}
							className="cursor-pointer rounded-full border border-line px-2.5 py-1 font-bold text-[12px] text-soft hover:border-lime hover:text-ink"
						>
							+ {p.name}
						</button>
					))}
				</div>
			) : null}
			<div className="flex flex-wrap gap-2">
				<Input
					type="email"
					value={email}
					aria-label="Co-host's email"
					placeholder="Add a co-host by email"
					onChange={(ev) => setEmail(ev.target.value)}
					onKeyDown={(ev) => {
						if (ev.key === "Enter") {
							ev.preventDefault();
							addEmail(email);
						}
					}}
					className="min-w-0 flex-[1_1_220px]"
				/>
				<Button
					variant="outline"
					disabled={add.isPending || !email.trim()}
					onClick={() => addEmail(email)}
				>
					Add co-host
				</Button>
			</div>
			<span className="text-[13px] text-haze">
				Co-hosts can edit the event, see the whole guest list and send for it.
				They have to be hosts on the site; an admin can make anyone a host.
				{loaded ? "" : " They're added when you save."}
			</span>
		</Panel>
	);
}
