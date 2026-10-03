import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { Textarea } from "@rsvp-site/ui/components/textarea";
import { cn } from "@rsvp-site/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
export function BookPicker({
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
		const q = query.trim().toLowerCase();
		return (book.data?.people ?? []).filter(
			(p) =>
				!exclude?.has(p.userId) &&
				(!q || p.name.toLowerCase().includes(q) || p.email.includes(q)),
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

/**
 * Put more people on an event's list: typed or pasted addresses, and whole
 * contact groups. Nobody is emailed here; the page offers to send after.
 */
export function AddGuests({
	eventId,
	published,
	paper = false,
	onList,
	onAdded,
}: {
	eventId: string;
	published: boolean;
	/** Paper events also take bare names, one per line. */
	paper?: boolean;
	/** Who is already on the list, left out of the address-book picker. */
	onList?: ReadonlySet<string>;
	onAdded: () => void;
}) {
	const [emails, setEmails] = useState("");
	const [groupIds, setGroupIds] = useState<string[]>([]);
	const [userIds, setUserIds] = useState<string[]>([]);

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
				setUserIds([]);
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
				add.mutate({ eventId, emails, groupIds, userIds });
			}}
		>
			<h2 className="m-0 text-[20px]">Invite more</h2>
			<BookPicker selected={userIds} onChange={setUserIds} exclude={onList} />
			<GroupChips
				selected={groupIds}
				onToggle={(id) =>
					setGroupIds((ids) =>
						ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
					)
				}
			/>
			<label htmlFor="add-emails" className="sr-only">
				Guests to invite
			</label>
			<Textarea
				id="add-emails"
				value={emails}
				placeholder={
					paper
						? "First Last <email@domain.com>\nFirst Last\n\nOne guest per line: a name and email, or just a name for a card-only guest."
						: "First Last <email@domain.com>\nFirst Last <email@domain.com>\n\nOne guest per line (or separated by commas). An email alone works too."
				}
				onChange={(ev) => setEmails(ev.target.value)}
			/>
			<div className="flex flex-wrap items-center gap-3">
				<Button
					type="submit"
					variant="light"
					disabled={
						add.isPending ||
						(!emails.trim() && groupIds.length === 0 && userIds.length === 0)
					}
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
