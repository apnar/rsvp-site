import { Input } from "@rsvp-site/ui/components/input";
import { Textarea } from "@rsvp-site/ui/components/textarea";
import { cn } from "@rsvp-site/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useMemo, useState } from "react";

import { matchesPerson } from "@/lib/format";
import { orpc } from "@/utils/orpc";

type ChipMember = { id: string; name: string; tag?: string };
type Chip = {
	key: string;
	label: string;
	tag?: string;
	members: ChipMember[];
};

/**
 * Every chip the host can open: their own groups, groups an admin shared,
 * and families. Keys are prefixed because the three kinds have separate id
 * spaces and `GuestPick.chips` holds them in one list.
 */
function useChips(): Chip[] {
	const book = useQuery(orpc.contacts.book.queryOptions());
	const shared = useQuery(orpc.contacts.shared.queryOptions());
	return useMemo(() => {
		const own = (book.data?.groups ?? []).map((g) => ({
			key: `g:${g.id}`,
			label: g.name,
			members: (book.data?.people ?? [])
				.filter((p) => p.groupIds.includes(g.id))
				.map((p) => ({ id: p.userId, name: p.name })),
		}));
		const groups = (shared.data?.groups ?? []).map((g) => ({
			key: `s:${g.id}`,
			label: g.name,
			tag: `shared by ${g.ownerName}`,
			members: g.members,
		}));
		const families = (shared.data?.families ?? []).map((f) => ({
			key: `f:${f.id}`,
			label: f.name,
			tag: "family",
			members: f.members.map((m) => ({
				id: m.id,
				name: m.name,
				tag: m.child ? "kid" : m.noEmail ? "no email" : undefined,
			})),
		}));
		return [...own, ...groups, ...families];
	}, [book.data, shared.data]);
}

/** Groups and families as toggle chips: "King Farm Swim Team · 64". */
function GroupChips({
	chips,
	open,
	onToggle,
}: {
	chips: Chip[];
	open: string[];
	onToggle: (chip: Chip) => void;
}) {
	if (chips.length === 0) return null;
	return (
		<div className="flex flex-wrap gap-2">
			{chips.map((c) => {
				const on = open.includes(c.key);
				return (
					<button
						key={c.key}
						type="button"
						aria-pressed={on}
						onClick={() => onToggle(c)}
						className={cn(
							"inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 font-bold text-[14px] transition-colors",
							on
								? "border-lime bg-lime/14 text-ink"
								: "border-line-strong text-soft hover:border-haze hover:text-ink",
						)}
					>
						{c.label} · {c.members.length}
						{c.tag ? (
							<span className="font-semibold text-[12px] text-haze">
								{c.tag}
							</span>
						) : null}
						{on ? <span className="text-haze">×</span> : null}
					</button>
				);
			})}
		</div>
	);
}

/** An open chip's members as ticked checkboxes, so one can be left out. */
function OpenChip({
	chip,
	selected,
	onToggle,
	exclude,
}: {
	chip: Chip;
	selected: string[];
	onToggle: (id: string) => void;
	exclude?: ReadonlySet<string>;
}) {
	const members = chip.members.filter((m) => !exclude?.has(m.id));
	const left = chip.members.length - members.length;
	return (
		<fieldset className="m-0 flex flex-col gap-1 rounded-[18px] border border-line p-3">
			<legend className="px-1 font-bold text-[13px] text-soft">
				{chip.label}
			</legend>
			{members.map((m) => (
				<label
					key={m.id}
					className="flex cursor-pointer items-center gap-3 rounded-[12px] px-2 py-1.5 hover:bg-panel-2"
				>
					<input
						type="checkbox"
						checked={selected.includes(m.id)}
						onChange={() => onToggle(m.id)}
						className="size-4 accent-lime"
					/>
					<span className="min-w-0 flex-1 truncate">
						<b className="text-[14px]">{m.name}</b>
						{m.tag ? (
							<span className="ml-2 rounded-full border border-line px-2 py-0.5 text-[11px] text-haze">
								{m.tag}
							</span>
						) : null}
					</span>
				</label>
			))}
			{left > 0 ? (
				<span className="px-2 text-[12px] text-haze">
					{left} already on the list.
				</span>
			) : null}
		</fieldset>
	);
}

/**
 * Pick people from the host's address book: a search box over a short
 * scrolling list of checkboxes. Anybody already on the event is left out.
 */
function BookPicker({
	selected,
	onChange,
	exclude,
}: {
	selected: string[];
	onChange: (ids: string[]) => void;
	exclude?: ReadonlySet<string>;
}) {
	const book = useQuery(orpc.contacts.book.queryOptions());
	const [query, setQuery] = useState("");
	const people = useMemo(() => {
		return (book.data?.people ?? []).filter(
			(p) => !exclude?.has(p.userId) && matchesPerson(p, query),
		);
	}, [book.data, query, exclude]);
	if (!book.data) return null;
	if (book.data.people.length === 0) {
		return (
			<span className="text-[13px] text-haze">
				Your <Link to="/contacts">address book</Link> fills up as you invite
				people, so next time you can pick them from it.
			</span>
		);
	}
	const toggle = (id: string) =>
		onChange(
			selected.includes(id)
				? selected.filter((x) => x !== id)
				: [...selected, id],
		);
	return (
		<div className="flex flex-col gap-2 rounded-[18px] border border-line p-3">
			<div className="flex flex-wrap items-center gap-2">
				<label htmlFor="book-pick" className="sr-only">
					Find in your address book
				</label>
				<Input
					id="book-pick"
					type="search"
					placeholder="From your address book"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className="min-h-10 flex-1 rounded-full py-2"
				/>
				{selected.length > 0 ? (
					<span className="text-[13px] text-lime-ink">
						{selected.length} picked
					</span>
				) : null}
			</div>
			{people.length === 0 ? (
				<span className="px-1 text-[13px] text-haze">
					{query
						? "Nobody by that name."
						: "Everybody in your book is on the list."}
				</span>
			) : (
				<ul className="m-0 flex max-h-56 list-none flex-col overflow-y-auto p-0">
					{people.map((p) => {
						const on = selected.includes(p.userId);
						return (
							<li key={p.userId}>
								<label className="flex cursor-pointer items-center gap-3 rounded-[12px] px-2 py-1.5 hover:bg-panel-2">
									<input
										type="checkbox"
										checked={on}
										onChange={() => toggle(p.userId)}
										className="size-4 accent-lime"
									/>
									<span className="min-w-0 flex-1 truncate">
										<b className="text-[14px]">{p.name}</b>{" "}
										<span className="text-[13px] text-haze">
											{p.noEmail ? "no email" : p.email}
										</span>
									</span>
								</label>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

/** Who to put on a list: typed addresses, contact groups, address-book picks. */
export type GuestPick = {
	emails: string;
	userIds: string[];
	/** UI only, never sent: keys of the open chips, so NO_PICK closes them. */
	chips: string[];
};

export const NO_PICK: GuestPick = { emails: "", userIds: [], chips: [] };

export const hasPick = (v: GuestPick) =>
	v.emails.trim().length > 0 || v.userIds.length > 0;

/**
 * The one way a host chooses guests, for a new event and for one already
 * out: the address book, group chips and a box for typed addresses. It owns
 * no state; the caller decides when the pick is spent. Paper events also
 * take bare names, so they get their own wording.
 */
export function GuestPicker({
	value,
	onChange,
	paper,
	exclude,
}: {
	value: GuestPick;
	onChange: (value: GuestPick) => void;
	paper: boolean;
	/** Who is already on the list, left out of the address-book picker. */
	exclude?: ReadonlySet<string>;
}) {
	const emailsId = useId();
	const chips = useChips();
	const openChips = chips.filter((c) => value.chips.includes(c.key));
	// Choosing a chip ticks its members; the ticks are the real pick
	// (`userIds`), so the server never has to expand a group. Closing a chip
	// unticks its members except any another open chip also holds.
	const toggleChip = (chip: Chip) => {
		if (!value.chips.includes(chip.key)) {
			const add = chip.members
				.map((m) => m.id)
				.filter((id) => !exclude?.has(id) && !value.userIds.includes(id));
			onChange({
				...value,
				chips: [...value.chips, chip.key],
				userIds: [...value.userIds, ...add],
			});
			return;
		}
		const kept = new Set(
			openChips
				.filter((c) => c.key !== chip.key)
				.flatMap((c) => c.members.map((m) => m.id)),
		);
		const drop = new Set(
			chip.members.map((m) => m.id).filter((id) => !kept.has(id)),
		);
		onChange({
			...value,
			chips: value.chips.filter((k) => k !== chip.key),
			userIds: value.userIds.filter((id) => !drop.has(id)),
		});
	};
	const toggleUser = (id: string) =>
		onChange({
			...value,
			userIds: value.userIds.includes(id)
				? value.userIds.filter((x) => x !== id)
				: [...value.userIds, id],
		});
	return (
		<>
			<BookPicker
				selected={value.userIds}
				onChange={(userIds) => onChange({ ...value, userIds })}
				exclude={exclude}
			/>
			<GroupChips chips={chips} open={value.chips} onToggle={toggleChip} />
			{openChips.map((c) => (
				<OpenChip
					key={c.key}
					chip={c}
					selected={value.userIds}
					onToggle={toggleUser}
					exclude={exclude}
				/>
			))}
			<label htmlFor={emailsId} className="sr-only">
				Guests to invite
			</label>
			<Textarea
				id={emailsId}
				value={value.emails}
				placeholder={
					paper
						? "Linh Nguyen <linh@example.com> 301-555-1212\nPriya Shah\n\nOne guest per line: name, email, phone. A name alone works for a card-only guest."
						: "Linh Nguyen <linh@example.com> 301-555-1212\npriya@example.com\n\nOne guest per line: name, email, phone. An email alone works too."
				}
				onChange={(ev) => onChange({ ...value, emails: ev.target.value })}
			/>
			<span className="text-[13px] text-haze">
				{paper
					? "Each guest answers with the QR code on their card. Nobody is emailed until you start emails."
					: "Guests sign in with their email to RSVP, so every answer has a name on it. Nobody is emailed until you send."}
			</span>
		</>
	);
}
