import { canHost } from "@rsvp-site/db/roles";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { Textarea } from "@rsvp-site/ui/components/textarea";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/controls";
import { Page, PageHead, Panel } from "@/components/page";
import type { Outputs } from "@/lib/api-types";
import { plural } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/contacts")({
	beforeLoad: ({ context }) => {
		if (!canHost(context.session.user)) throw redirect({ to: "/events" });
	},
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(orpc.contacts.list.queryOptions()),
	head: () => ({ meta: [{ title: "Contacts · Botch RSVP" }] }),
	component: ContactsPage,
});

type Group = Outputs["contacts"]["list"][number];

function ContactsPage() {
	const { data } = useSuspenseQuery(orpc.contacts.list.queryOptions());
	return (
		<Page>
			<PageHead kicker="Contacts" title="Your crowds." />
			<p className="m-0 -mt-4 max-w-[60ch] text-[17px] text-soft">
				Keep the people you invite again and again in groups, then add a whole
				group to an event in one tap. Only you see your groups.
			</p>
			<NewGroup />
			<div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,360px),1fr))] items-start gap-5">
				{data.map((g) => (
					<GroupCard key={g.id} group={g} />
				))}
			</div>
		</Page>
	);
}

function useRefresh() {
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: orpc.contacts.key() });
}

function NewGroup() {
	const refresh = useRefresh();
	const [name, setName] = useState("");
	const [emails, setEmails] = useState("");
	const create = useMutation(
		orpc.contacts.create.mutationOptions({
			onSuccess: (r) => {
				toast.success(
					`Group made with ${plural(r.added, "person", "people")}.`,
				);
				setName("");
				setEmails("");
				refresh();
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);
	return (
		<Panel
			as="form"
			className="max-w-[720px]"
			onSubmit={(e) => {
				e.preventDefault();
				create.mutate({ name, emails });
			}}
		>
			<h2 className="m-0 text-[20px]">New group</h2>
			<Field label="Name" htmlFor="group-name">
				<Input
					id="group-name"
					value={name}
					maxLength={80}
					placeholder="King Farm Swim Team"
					onChange={(e) => setName(e.target.value)}
				/>
			</Field>
			<Field label="People" htmlFor="group-emails">
				<Textarea
					id="group-emails"
					value={emails}
					placeholder="Paste emails, separated by commas or new lines"
					onChange={(e) => setEmails(e.target.value)}
				/>
			</Field>
			<Button
				type="submit"
				className="self-start"
				disabled={create.isPending || !name.trim()}
			>
				Make the group
			</Button>
		</Panel>
	);
}

function GroupCard({ group }: { group: Group }) {
	const refresh = useRefresh();
	const [name, setName] = useState(group.name);
	const [emails, setEmails] = useState("");
	const [sure, setSure] = useState(false);
	const onError = (error: Error) => toast.error(error.message);
	const rename = useMutation(
		orpc.contacts.rename.mutationOptions({ onSuccess: refresh, onError }),
	);
	const remove = useMutation(
		orpc.contacts.remove.mutationOptions({ onSuccess: refresh, onError }),
	);
	const addMembers = useMutation(
		orpc.contacts.addMembers.mutationOptions({
			onSuccess: (r) => {
				toast.success(`Added ${plural(r.added, "person", "people")}.`);
				setEmails("");
				refresh();
			},
			onError,
		}),
	);
	const removeMember = useMutation(
		orpc.contacts.removeMember.mutationOptions({ onSuccess: refresh, onError }),
	);

	return (
		<article className="flex flex-col gap-3.5 rounded-[26px] border border-line bg-panel p-[22px]">
			<div className="flex items-center gap-2">
				<label htmlFor={`name-${group.id}`} className="sr-only">
					Group name
				</label>
				<Input
					id={`name-${group.id}`}
					value={name}
					maxLength={80}
					onChange={(e) => setName(e.target.value)}
					onBlur={() => {
						if (name.trim() && name !== group.name) {
							rename.mutate({ groupId: group.id, name });
						}
					}}
					className="min-h-10 border-transparent bg-transparent px-0 font-bold font-heading text-[20px] hover:border-transparent focus-visible:border-line-strong focus-visible:px-3"
				/>
				<span className="flex-none text-[14px] text-haze">
					{group.members.length}
				</span>
			</div>
			<ul className="m-0 flex max-h-72 list-none flex-col gap-1 overflow-y-auto p-0">
				{group.members.map((m) => (
					<li
						key={m.userId}
						className="flex items-center gap-2 border-line border-t py-2 text-[14px]"
					>
						<span className="min-w-0 flex-1 truncate">
							<b>{m.name}</b> <span className="text-haze">{m.email}</span>
						</span>
						{m.unsubscribed ? (
							<span className="text-[12px] text-pink-soft">no email</span>
						) : null}
						<button
							type="button"
							aria-label={`Take ${m.name} out of ${group.name}`}
							className="cursor-pointer border-0 bg-transparent text-haze hover:text-ink"
							onClick={() =>
								removeMember.mutate({ groupId: group.id, userId: m.userId })
							}
						>
							×
						</button>
					</li>
				))}
			</ul>
			<form
				className="flex flex-col gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					addMembers.mutate({ groupId: group.id, emails });
				}}
			>
				<label htmlFor={`add-${group.id}`} className="sr-only">
					Add people to {group.name}
				</label>
				<Textarea
					id={`add-${group.id}`}
					value={emails}
					placeholder="Add emails"
					className="min-h-12"
					onChange={(e) => setEmails(e.target.value)}
				/>
				<div className="flex items-center justify-between gap-2">
					<Button
						type="submit"
						variant="light"
						size="sm"
						disabled={!emails.trim() || addMembers.isPending}
					>
						Add
					</Button>
					{sure ? (
						<span className="flex gap-1.5">
							<Button
								variant="destructive"
								size="sm"
								onClick={() => remove.mutate({ groupId: group.id })}
							>
								Delete group
							</Button>
							<Button variant="ghost" size="sm" onClick={() => setSure(false)}>
								Keep
							</Button>
						</span>
					) : (
						<Button variant="ghost" size="sm" onClick={() => setSure(true)}>
							Delete
						</Button>
					)}
				</div>
			</form>
		</article>
	);
}
