import { formatPhone } from "@rsvp-site/db/phone";
import { canHost } from "@rsvp-site/db/roles";
import { possessive } from "@rsvp-site/design/placeholders";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { Textarea } from "@rsvp-site/ui/components/textarea";
import { cn } from "@rsvp-site/ui/lib/utils";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Avatar } from "@/components/brand";
import { ConfirmAction } from "@/components/confirm-action";
import { Field } from "@/components/controls";
import { NativeSelect } from "@/components/native-select";
import { Page, PageHead, Panel } from "@/components/page";
import { PersonDetailsDialog } from "@/components/person-details";
import { RenameInput } from "@/components/rename-input";
import { TextsOkCheckbox } from "@/components/texts-copy";
import { pageTitle } from "@/content/site";
import type { Outputs } from "@/lib/api-types";
import type { DetailsPatch } from "@/lib/details-draft";
import { initials, matchesPerson, plural } from "@/lib/format";
import { phoneLines } from "@/lib/phone-lines";
import { orpc } from "@/utils/orpc";

const bookQuery = () => orpc.contacts.book.queryOptions();

export const Route = createFileRoute("/_auth/contacts")({
	// The group being shown is in the URL so Back and a refresh keep it;
	// everybody is the absence of it.
	validateSearch: z.object({
		group: z.string().optional().catch(undefined),
	}),
	beforeLoad: ({ context }) => {
		if (!canHost(context.session.user)) throw redirect({ to: "/events" });
	},
	loader: ({ context }) => context.queryClient.ensureQueryData(bookQuery()),
	head: () => ({ meta: [{ title: pageTitle("Contacts") }] }),
	component: ContactsPage,
});

type Book = Outputs["contacts"]["book"];
type Group = Book["groups"][number];
type Person = Book["people"][number];

function ContactsPage() {
	const { data } = useSuspenseQuery(bookQuery());
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
	const { group: picked } = Route.useSearch();
	const navigate = Route.useNavigate();
	// A group that has since been deleted shows everybody, as no filter.
	const group = book.groups.some((g) => g.id === picked) ? picked : undefined;
	const shown = useMemo(
		() =>
			book.people.filter(
				(p) =>
					(!group || p.groupIds.includes(group)) && matchesPerson(p, query),
			),
		[book.people, query, group],
	);

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
							value={group ?? "all"}
							onChange={(e) =>
								navigate({
									search: (prev) => ({
										...prev,
										group:
											e.target.value === "all" ? undefined : e.target.value,
									}),
								})
							}
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

/**
 * A value that turns into input(s) on click. One edit at a time; Enter or
 * leaving the field saves, Esc puts it back. The pencil is there for
 * keyboard users, who can't click the text.
 */
function InlineEdit({
	label,
	display,
	inputs,
	onSave,
	editable,
	className,
}: {
	label: string;
	display: ReactNode;
	inputs: { key: string; label: string; value: string; type?: string }[];
	onSave: (values: Record<string, string>) => Promise<unknown>;
	editable: boolean;
	className?: string;
}) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState(false);
	const pencil = useRef<HTMLButtonElement>(null);

	if (!editable) {
		return <span className={cn("block truncate", className)}>{display}</span>;
	}

	const start = () => {
		setDraft(Object.fromEntries(inputs.map((i) => [i.key, i.value])));
		setEditing(true);
	};
	const stop = () => {
		setEditing(false);
		// Put focus back where the keyboard was.
		requestAnimationFrame(() => pencil.current?.focus());
	};
	// `refocus` only for Enter: a blur commit means the keyboard went
	// somewhere on purpose, and the pencil must not take it back.
	const commit = async (refocus: boolean) => {
		const changed = Object.fromEntries(
			inputs
				.filter((i) => (draft[i.key] ?? "").trim() !== i.value.trim())
				.map((i) => [i.key, draft[i.key] ?? ""]),
		);
		if (Object.keys(changed).length === 0) return setEditing(false);
		setBusy(true);
		try {
			await onSave(changed);
			if (refocus) stop();
			else setEditing(false);
		} catch {
			// Already toasted; keep the input so it can be fixed.
		} finally {
			setBusy(false);
		}
	};

	if (editing) {
		return (
			<fieldset
				aria-label={label}
				className="m-0 flex gap-1.5 border-0 p-0"
				onBlur={(e) => {
					if (!e.currentTarget.contains(e.relatedTarget) && !busy) {
						void commit(false);
					}
				}}
			>
				{inputs.map((i, n) => (
					<Input
						key={i.key}
						aria-label={i.label}
						type={i.type}
						value={draft[i.key] ?? ""}
						disabled={busy}
						autoFocus={n === 0}
						onChange={(e) =>
							setDraft((d) => ({ ...d, [i.key]: e.target.value }))
						}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								void commit(true);
							} else if (e.key === "Escape") {
								e.preventDefault();
								stop();
							}
						}}
						className="min-h-8 min-w-0 flex-1 rounded-[10px] px-2.5 py-1 text-[14px]"
					/>
				))}
			</fieldset>
		);
	}
	return (
		<span className={cn("flex items-center gap-1", className)}>
			<button
				type="button"
				onClick={start}
				className="min-w-0 cursor-text truncate rounded text-left hover:underline"
			>
				{display}
			</button>
			<button
				ref={pencil}
				type="button"
				onClick={start}
				aria-label={`Edit ${label}`}
				className="cursor-pointer text-[12px] text-haze hover:text-ink"
			>
				<Pencil aria-hidden className="size-3" />
			</button>
		</span>
	);
}

/** One person, with a chip per group to put them in or take them out. */
function BookRow({ person: p, groups }: { person: Person; groups: Group[] }) {
	const setMember = useMutation(orpc.contacts.setMember.mutationOptions());
	const remove = useMutation(orpc.contacts.removePerson.mutationOptions());
	const update = useMutation(orpc.contacts.update.mutationOptions());
	const setEmail = useMutation(
		orpc.contacts.setEmail.mutationOptions({
			onSuccess: (r) => {
				if (r.moved) {
					toast.success(
						`That address is ${possessive(r.name)}, so this entry is theirs now.`,
					);
				}
			},
		}),
	);
	const [open, setOpen] = useState(false);
	// The server's rule (`canEditDetails`), said the way it applies here.
	const reason = p.claimed
		? "They've signed in, so their details are theirs to change."
		: p.inFamily
			? "They're in a family, so the site's admins keep their details."
			: "Only they or an admin can change a host's details.";
	const saveDetails = (patch: DetailsPatch) =>
		update.mutateAsync({ userId: p.userId, ...patch });
	const saveEmail = (email: string) =>
		setEmail.mutateAsync({ userId: p.userId, email });
	return (
		<li className="flex flex-col gap-2 border-line border-t py-3">
			<div className="flex items-center gap-3">
				<Avatar
					initials={initials(p.name)}
					image={p.image}
					className="size-9 text-[12px]"
				/>
				<span className="min-w-0 flex-1">
					<InlineEdit
						label={`${p.name}'s name`}
						editable={p.editable}
						display={<b>{p.name}</b>}
						className="block"
						inputs={[
							{
								key: "firstName",
								label: "First name",
								value: p.firstName ?? "",
							},
							{ key: "lastName", label: "Last name", value: p.lastName ?? "" },
						]}
						onSave={saveDetails}
					/>
					<InlineEdit
						label={`${p.name}'s email`}
						editable={p.editable && p.reachEditable}
						className="text-[13px] text-haze"
						display={
							p.noEmail
								? "No email"
								: `${p.email}${p.unsubscribed ? " · no email" : ""}`
						}
						inputs={[
							{
								key: "email",
								label: "Email",
								type: "email",
								value: p.noEmail ? "" : p.email,
							},
						]}
						onSave={async (v) => {
							// An emptied box is "never mind", not an address to set.
							const email = v.email?.trim();
							if (email) await saveEmail(email);
						}}
					/>
					{(p.editable && p.reachEditable) || p.phone ? (
						<InlineEdit
							label={`${p.name}'s phone`}
							editable={p.editable && p.reachEditable}
							className="text-[13px] text-haze"
							display={p.phone ? formatPhone(p.phone) : "Add a phone"}
							inputs={[
								{
									key: "phone",
									label: "Mobile phone",
									type: "tel",
									value: formatPhone(p.phone),
								},
							]}
							onSave={saveDetails}
						/>
					) : null}
					{p.claimed ? (
						<span className="block text-[12px] text-haze">signed in</span>
					) : null}
				</span>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => setOpen(true)}
					aria-label={`Edit ${p.name}`}
				>
					Edit
				</Button>
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
			{open ? (
				<PersonDetailsDialog
					person={p}
					editable={p.editable}
					reachEditable={p.reachEditable}
					lockedReason={reason}
					pending={update.isPending || setEmail.isPending}
					onSave={saveDetails}
					onSaveEmail={saveEmail}
					onClose={() => setOpen(false)}
				/>
			) : null}
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
	const [emails, setEmails] = useState("");
	const [textsOk, setTextsOk] = useState(false);
	const phones = phoneLines(emails);
	const add = useMutation(
		orpc.contacts.addPeople.mutationOptions({
			onSuccess: (r) => {
				toast.success(`Added ${plural(r.added, "person", "people")}.`);
				setEmails("");
				setTextsOk(false);
			},
		}),
	);
	return (
		<Panel
			title="Add people"
			as="form"
			onSubmit={(e) => {
				e.preventDefault();
				add.mutate({ emails, textsOk });
			}}
		>
			<Field label="People, one per line" htmlFor="book-add">
				<Textarea
					id="book-add"
					value={emails}
					placeholder={
						"Linh Nguyen <linh@example.com> 301-555-1212\nPat Smith 301-555-0101\nPriya Shah"
					}
					onChange={(e) => setEmails(e.target.value)}
				/>
			</Field>
			{phones.any ? (
				<TextsOkCheckbox checked={textsOk} onChange={setTextsOk} />
			) : null}
			<p className="m-0 text-[13px] text-haze">
				Name, email and phone, one person per line. A name alone is fine for
				paper invitations. Nobody is invited or emailed; they just join your
				book.
			</p>
			<Button
				type="submit"
				variant="light"
				className="self-start"
				disabled={
					add.isPending || !emails.trim() || (phones.phoneOnly && !textsOk)
				}
			>
				Add to address book
			</Button>
		</Panel>
	);
}

function Groups({ groups }: { groups: Group[] }) {
	const [name, setName] = useState("");
	const create = useMutation(
		orpc.contacts.create.mutationOptions({
			onSuccess: () => {
				toast.success("Group made. Tick people into it in the address book.");
				setName("");
			},
		}),
	);
	return (
		<Panel title="Groups" className="gap-3">
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
	const rename = useMutation(orpc.contacts.rename.mutationOptions());
	const remove = useMutation(orpc.contacts.remove.mutationOptions());
	return (
		<li className="flex items-center gap-2 border-line border-t py-2">
			<label htmlFor={`group-${group.id}`} className="sr-only">
				Name of the group {group.name}
			</label>
			<RenameInput
				id={`group-${group.id}`}
				value={group.name}
				maxLength={80}
				onCommit={(name) => rename.mutateAsync({ groupId: group.id, name })}
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
