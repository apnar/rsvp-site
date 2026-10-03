import { Input } from "@rsvp-site/ui/components/input";
import { Textarea } from "@rsvp-site/ui/components/textarea";
import { cn } from "@rsvp-site/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useMemo, useState } from "react";

import { matchesPerson } from "@/lib/format";
import { orpc } from "@/utils/orpc";

/** Contact groups as toggle chips: "King Farm Swim Team · 64". */
function GroupChips({
	selected,
	onToggle,
}: {
	selected: string[];
	onToggle: (id: string) => void;
}) {
	const book = useQuery(orpc.contacts.book.queryOptions());
	if (!book.data) return null;
	if (book.data.groups.length === 0) return null;
	return (
		<div className="flex flex-wrap gap-2">
			{book.data.groups.map((g) => {
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
						{g.name} · {g.count}
						{on ? <span className="text-haze">×</span> : null}
					</button>
				);
			})}
		</div>
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
											{p.noEmail ? "paper only" : p.email}
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
	groupIds: string[];
	userIds: string[];
};

export const NO_PICK: GuestPick = { emails: "", groupIds: [], userIds: [] };

export const hasPick = (v: GuestPick) =>
	v.emails.trim().length > 0 || v.groupIds.length > 0 || v.userIds.length > 0;

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
	return (
		<>
			<BookPicker
				selected={value.userIds}
				onChange={(userIds) => onChange({ ...value, userIds })}
				exclude={exclude}
			/>
			<GroupChips
				selected={value.groupIds}
				onToggle={(id) =>
					onChange({
						...value,
						groupIds: value.groupIds.includes(id)
							? value.groupIds.filter((x) => x !== id)
							: [...value.groupIds, id],
					})
				}
			/>
			<label htmlFor={emailsId} className="sr-only">
				Guests to invite
			</label>
			<Textarea
				id={emailsId}
				value={value.emails}
				placeholder={
					paper
						? "First Last <email@domain.com>\nFirst Last\n\nOne guest per line: a name and email, or just a name for a card-only guest."
						: "First Last <email@domain.com>\nFirst Last <email@domain.com>\n\nOne guest per line (or separated by commas). An email alone works too."
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
