import { canHost } from "@rsvp-site/db/roles";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { Textarea } from "@rsvp-site/ui/components/textarea";
import { cn } from "@rsvp-site/ui/lib/utils";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/brand";
import { ConfirmAction } from "@/components/confirm-action";
import { Field } from "@/components/controls";
import { NativeSelect } from "@/components/native-select";
import { Page, PageHead, Panel } from "@/components/page";
import type { Outputs } from "@/lib/api-types";
import { initials, plural } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/contacts")({
	beforeLoad: ({ context }) => {
		if (!canHost(context.session.user)) throw redirect({ to: "/events" });
	},
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(orpc.contacts.book.queryOptions()),
	head: () => ({ meta: [{ title: "Contacts · Botch RSVP" }] }),
	component: ContactsPage,
});

type Book = Outputs["contacts"]["book"];
type Group = Book["groups"][number];
type Person = Book["people"][number];

function useRefresh() {
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: orpc.contacts.key() });
}

const onError = (error: Error) => toast.error(error.message);

function ContactsPage() {
	const { data } = useSuspenseQuery(orpc.contacts.book.queryOptions());
	return (
		<Page>
			<PageHead kicker="Contacts" title="Your people." />
			<p className="m-0 -mt-4 max-w-[62ch] text-[17px] text-soft">
				Everyone you invite lands in your address book, so next time it's a pick
				from the list. Sort them into groups to invite a whole crowd in one tap.
				Only you see your book and your groups.
			</p>
			<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-start gap-5">
				<AddressBook book={data} />
				<div className="flex flex-col gap-5">
					<AddPeople />
					<Groups groups={data.groups} />
				</div>
			</div>
		</Page>
	);
}

function AddressBook({ book }: { book: Book }) {
	const [query, setQuery] = useState("");
	const [group, setGroup] = useState<string>("all");
	const shown = useMemo(() => {
		const q = query.trim().toLowerCase();
		return book.people.filter(
			(p) =>
				(group === "all" || p.groupIds.includes(group)) &&
				(!q || p.name.toLowerCase().includes(q) || p.email.includes(q)),
		);
	}, [book.people, query, group]);

	return (
		<Panel className="gap-3.5">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h2 className="m-0 text-[20px]">Address book</h2>
				<span className="text-[13px] text-haze">
					{plural(book.people.length, "person", "people")}
				</span>
			</div>
			<div className="flex flex-wrap gap-2">
				<label htmlFor="book-find" className="sr-only">
					Find somebody
				</label>
				<Input
					id="book-find"
					type="search"
					placeholder="Find somebody"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className="min-h-11 flex-[1_1_180px] rounded-full py-2.5"
				/>
				{book.groups.length > 0 ? (
					<>
						<label htmlFor="book-group" className="sr-only">
							Show a group
						</label>
						<NativeSelect
							id="book-group"
							value={group}
							onChange={(e) => setGroup(e.target.value)}
							className="min-h-11 px-4"
						>
							<option value="all">Everybody</option>
							{book.groups.map((g) => (
								<option key={g.id} value={g.id}>
									{g.name}
								</option>
							))}
						</NativeSelect>
					</>
				) : null}
			</div>
			{book.people.length === 0 ? (
				<p className="m-0 text-soft">
					Nobody yet. People you invite to an event show up here.
				</p>
			) : (
				<ul className="m-0 flex list-none flex-col p-0">
					{shown.map((p) => (
						<BookRow key={p.userId} person={p} groups={book.groups} />
					))}
				</ul>
			)}
		</Panel>
	);
}

/** One person, with a chip per group to put them in or take them out. */
function BookRow({ person: p, groups }: { person: Person; groups: Group[] }) {
	const refresh = useRefresh();
	const setMember = useMutation(
		orpc.contacts.setMember.mutationOptions({ onSuccess: refresh, onError }),
	);
	const remove = useMutation(
		orpc.contacts.removePerson.mutationOptions({
			onSuccess: refresh,
			onError,
		}),
	);
	return (
		<li className="flex flex-col gap-2 border-line border-t py-3">
			<div className="flex items-center gap-3">
				<Avatar initials={initials(p.name)} className="size-9 text-[12px]" />
				<span className="min-w-0 flex-1">
					<b className="block truncate">{p.name}</b>
					<span className="block truncate text-[13px] text-haze">
						{p.noEmail
							? "No email · paper only"
							: `${p.email}${p.unsubscribed ? " · no email" : ""}`}
					</span>
				</span>
				<ConfirmAction
					size="xs"
					confirm="Remove"
					pending={remove.isPending}
					onConfirm={() => remove.mutate({ userId: p.userId })}
					trigger={{
						variant: "ghost",
						size: "icon-xs",
						"aria-label": `Remove ${p.name} from your address book`,
						className: "text-haze",
						children: "×",
					}}
				/>
			</div>
			{groups.length > 0 ? (
				<div className="flex flex-wrap gap-1.5 pl-12">
					{groups.map((g) => {
						const on = p.groupIds.includes(g.id);
						return (
							<button
								key={g.id}
								type="button"
								aria-pressed={on}
								disabled={setMember.isPending}
								onClick={() =>
									setMember.mutate({
										groupId: g.id,
										userId: p.userId,
										member: !on,
									})
								}
								className={cn(
									"cursor-pointer rounded-full border px-2.5 py-1 font-bold text-[12px] transition-colors",
									on
										? "border-lime bg-lime/14 text-ink"
										: "border-line text-haze hover:border-line-strong hover:text-soft",
								)}
							>
								{on ? "✓ " : "+ "}
								{g.name}
							</button>
						);
					})}
				</div>
			) : null}
		</li>
	);
}

function AddPeople() {
	const refresh = useRefresh();
	const [emails, setEmails] = useState("");
	const add = useMutation(
		orpc.contacts.addPeople.mutationOptions({
			onSuccess: (r) => {
				toast.success(`Added ${plural(r.added, "person", "people")}.`);
				setEmails("");
				refresh();
			},
			onError,
		}),
	);
	return (
		<Panel
			as="form"
			onSubmit={(e) => {
				e.preventDefault();
				add.mutate({ emails });
			}}
		>
			<h2 className="m-0 text-[20px]">Add people</h2>
			<Field
				label="Emails, separated by commas or new lines"
				htmlFor="book-add"
			>
				<Textarea
					id="book-add"
					value={emails}
					placeholder='"Linh Nguyen" <linh@example.com>, priya@example.com'
					onChange={(e) => setEmails(e.target.value)}
				/>
			</Field>
			<p className="m-0 text-[13px] text-haze">
				Nobody is invited or emailed; they just join your book.
			</p>
			<Button
				type="submit"
				variant="light"
				className="self-start"
				disabled={add.isPending || !emails.trim()}
			>
				Add to address book
			</Button>
		</Panel>
	);
}

function Groups({ groups }: { groups: Group[] }) {
	const refresh = useRefresh();
	const [name, setName] = useState("");
	const create = useMutation(
		orpc.contacts.create.mutationOptions({
			onSuccess: () => {
				toast.success("Group made. Tick people into it in the address book.");
				setName("");
				refresh();
			},
			onError,
		}),
	);
	return (
		<Panel className="gap-3">
			<h2 className="m-0 text-[20px]">Groups</h2>
			{groups.length === 0 ? (
				<p className="m-0 text-[14px] text-soft">
					No groups yet. Make one, then tick people into it in the address book.
				</p>
			) : (
				<ul className="m-0 flex list-none flex-col p-0">
					{groups.map((g) => (
						<GroupRow key={g.id} group={g} />
					))}
				</ul>
			)}
			<form
				className="flex flex-wrap gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					create.mutate({ name });
				}}
			>
				<label htmlFor="group-name" className="sr-only">
					New group name
				</label>
				<Input
					id="group-name"
					value={name}
					maxLength={80}
					placeholder="New group, e.g. King Farm Swim Team"
					onChange={(e) => setName(e.target.value)}
					className="min-w-0 flex-[1_1_200px]"
				/>
				<Button type="submit" disabled={create.isPending || !name.trim()}>
					Make it
				</Button>
			</form>
		</Panel>
	);
}

function GroupRow({ group }: { group: Group }) {
	const refresh = useRefresh();
	const [name, setName] = useState(group.name);
	const rename = useMutation(
		orpc.contacts.rename.mutationOptions({ onSuccess: refresh, onError }),
	);
	const remove = useMutation(
		orpc.contacts.remove.mutationOptions({ onSuccess: refresh, onError }),
	);
	return (
		<li className="flex items-center gap-2 border-line border-t py-2">
			<label htmlFor={`group-${group.id}`} className="sr-only">
				Group name
			</label>
			<Input
				id={`group-${group.id}`}
				value={name}
				maxLength={80}
				onChange={(e) => setName(e.target.value)}
				onBlur={() => {
					if (name.trim() && name !== group.name) {
						rename.mutate({ groupId: group.id, name });
					}
				}}
				className="min-h-9 flex-1 border-transparent bg-transparent px-0 font-bold hover:border-transparent focus-visible:border-line-strong focus-visible:px-3"
			/>
			<span className="text-[13px] text-haze">{group.count}</span>
			<ConfirmAction
				size="xs"
				confirm="Delete"
				pending={remove.isPending}
				onConfirm={() => remove.mutate({ groupId: group.id })}
				trigger={{
					variant: "ghost",
					size: "icon-xs",
					"aria-label": `Delete the group ${group.name}`,
					className: "text-haze",
					children: "×",
				}}
			/>
		</li>
	);
}
