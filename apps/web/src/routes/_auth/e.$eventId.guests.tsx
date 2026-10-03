import { formatDate } from "@rsvp-site/api/time";
import { Button, buttonVariants } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { cn } from "@rsvp-site/ui/lib/utils";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AddGuests } from "@/components/add-guests";
import { Avatar } from "@/components/brand";
import { Stepper } from "@/components/controls";
import { Page, PageHead } from "@/components/page";
import { PillTabs } from "@/components/pill-tabs";
import { AnswerTag, ResponseBar } from "@/components/response-bar";
import type { Outputs } from "@/lib/api-types";
import { ago, initials, plural, shortDate } from "@/lib/format";
import { PAPER_SIZES, type PaperSize } from "@/lib/paper-sizes";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/e/$eventId/guests")({
	loader: ({ context, params }) =>
		context.queryClient.ensureQueryData(
			orpc.guests.list.queryOptions({ input: { eventId: params.eventId } }),
		),
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData
					? `Guests · ${loaderData.event.title} · Botch RSVP`
					: "Botch RSVP",
			},
		],
	}),
	component: GuestListPage,
});

type Filter = "all" | "yes" | "maybe" | "no" | "waiting";
type Guest = Outputs["guests"]["list"]["guests"][number];

function GuestListPage() {
	const { eventId } = Route.useParams();
	const { session } = Route.useRouteContext();
	const queryClient = useQueryClient();
	const { data } = useSuspenseQuery(
		orpc.guests.list.queryOptions({ input: { eventId } }),
	);
	const [filter, setFilter] = useState<Filter>("all");
	const [query, setQuery] = useState("");
	const [adding, setAdding] = useState(false);
	const nowMs = Date.parse(data.now);
	const t = data.totals;
	const e = data.event;
	const published = e.status === "published";
	const notInvited = data.guests.filter(
		(g) => g.invitedAt === null && !g.unreachable,
	).length;

	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: orpc.guests.key() });

	const nudge = useMutation(
		orpc.events.nudge.mutationOptions({
			onSuccess: (r) => {
				toast.success(
					r.sent > 0
						? `Nudged ${plural(r.sent, "guest")}.`
						: "Already nudged in the last 12 hours.",
				);
				refresh();
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);
	const send = useMutation(
		orpc.events.send.mutationOptions({
			onSuccess: (r) => {
				toast.success(
					r.sent > 0
						? `Invited ${plural(r.sent, "more guest")}.${r.dryRun ? " (Logged, not sent: no mail key.)" : ""}`
						: "Nobody new to invite.",
				);
				refresh();
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);
	const remove = useMutation(
		orpc.guests.remove.mutationOptions({
			onSuccess: () => refresh(),
			onError: (error: Error) => toast.error(error.message),
		}),
	);

	const exportCsv = async () => {
		try {
			const { csv, fileName } = await client.events.exportCsv({ eventId });
			const url = URL.createObjectURL(
				new Blob([csv], { type: "text/csv;charset=utf-8" }),
			);
			const link = document.createElement("a");
			link.href = url;
			link.download = fileName;
			link.click();
			URL.revokeObjectURL(url);
		} catch (error) {
			toast.error((error as Error).message);
		}
	};

	const shown = useMemo(() => {
		const q = query.trim().toLowerCase();
		return data.guests.filter((g) => {
			if (
				filter === "waiting"
					? g.response !== null
					: filter !== "all" && g.response !== filter
			) {
				return false;
			}
			return !q || g.name.toLowerCase().includes(q) || g.email.includes(q);
		});
	}, [data.guests, filter, query]);

	return (
		<Page className="gap-[clamp(28px,4vw,44px)]">
			<Link
				to="/events"
				className="self-start font-bold text-[14px] no-underline"
			>
				← All events
			</Link>
			<PageHead
				size="md"
				kicker={`Guest list${e.date ? ` · ${formatDate(e.date)}` : ""}`}
				title={e.title}
				actions={
					<>
						<Button variant="outline" onClick={exportCsv}>
							Export
						</Button>
						{published && !e.emailsHeld && t.waiting > 0 ? (
							<Button
								variant="pink"
								disabled={nudge.isPending}
								onClick={() => nudge.mutate({ eventId })}
							>
								Nudge {t.waiting}
							</Button>
						) : null}
						{published && !e.emailsHeld && notInvited > 0 ? (
							<Button
								variant="send"
								disabled={send.isPending}
								onClick={() => send.mutate({ eventId })}
							>
								Send {plural(notInvited, "invite")}
							</Button>
						) : null}
						<Button onClick={() => setAdding((v) => !v)}>
							{adding ? "Done adding" : "+ Invite more"}
						</Button>
					</>
				}
			/>

			{adding ? (
				<AddGuests
					eventId={eventId}
					published={published}
					paper={e.paper}
					onList={new Set(data.guests.map((g) => g.userId))}
					onAdded={() => refresh()}
				/>
			) : null}

			{e.paper ? (
				<PaperPanel
					eventId={eventId}
					title={e.title}
					published={published}
					held={e.emailsHeld}
					releasedAt={e.emailsReleasedAt}
					emailable={notInvited}
					onChange={refresh}
				/>
			) : null}

			{e.status === "draft" ? (
				<p className="m-0 rounded-[18px] border border-pink bg-pink/14 px-4 py-3">
					This is a draft. Nobody has been invited yet.{" "}
					<Link to="/e/$eventId/edit" params={{ eventId }}>
						Finish it and send
					</Link>
					.
				</p>
			) : null}

			<section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3.5">
				<div className="flex flex-col gap-1.5 rounded-[26px] bg-lime p-[22px] text-night">
					<span className="kicker">Expected headcount</span>
					<span className="numeral font-black text-[clamp(56px,8vw,88px)] leading-[0.95]">
						{data.headcount}
					</span>
					<span className="font-medium text-[15px]">
						{plural(t.adults, "adult")} · {plural(t.kids, "kid")}
					</span>
				</div>
				<div className="flex flex-col justify-center gap-3.5 rounded-[26px] bg-panel p-[22px]">
					<ResponseBar totals={t} className="h-4" />
					<div className="grid grid-cols-4 gap-2">
						<Count value={t.yes} label="in" tone="text-lime" />
						<Count value={t.maybe} label="maybe" tone="text-pink" />
						<Count value={t.no} label="out" tone="text-ink" />
						<Count value={t.waiting} label="no reply" tone="text-haze" />
					</div>
					<span className="text-[13px] text-haze">
						{plural(t.invited, "household")} invited
						{e.rsvpDeadline
							? ` · RSVPs close ${formatDate(e.rsvpDeadline)}`
							: ""}
					</span>
				</div>
				{e.potluckEnabled ? (
					<div className="flex flex-col gap-3 rounded-[26px] bg-panel p-[22px]">
						<span className="kicker text-haze">Potluck</span>
						{data.potluck.length === 0 ? (
							<span className="text-soft">Nothing on the list yet.</span>
						) : (
							data.potluck.map((item) => {
								const pct = Math.min(100, (item.claimed / item.quantity) * 100);
								return (
									<div key={item.id} className="flex flex-col gap-1">
										<div className="flex justify-between text-[14px]">
											<span>{item.label}</span>
											<b
												className={cn(
													item.left === 0 && "text-lime",
													item.claimed === 0 && "text-pink-soft",
												)}
											>
												{item.claimed}/{item.quantity}
											</b>
										</div>
										<div
											className="h-1.5 rounded-full"
											style={{
												background: `linear-gradient(90deg, #c6ff3d ${pct}%, #362c52 ${pct}%)`,
											}}
										/>
									</div>
								);
							})
						)}
					</div>
				) : null}
			</section>

			<section className="flex flex-col gap-3.5">
				<div className="flex flex-wrap items-center gap-2.5">
					<PillTabs
						label="Show"
						value={filter}
						onChange={setFilter}
						options={[
							{ value: "all", label: "All", count: t.invited },
							{ value: "yes", label: "In", count: t.yes },
							{ value: "maybe", label: "Maybe", count: t.maybe },
							{ value: "no", label: "Out", count: t.no },
							{ value: "waiting", label: "No reply", count: t.waiting },
						]}
					/>
					<label htmlFor="find" className="sr-only">
						Find a guest
					</label>
					<Input
						id="find"
						type="search"
						placeholder="Find a guest"
						value={query}
						onChange={(ev) => setQuery(ev.target.value)}
						className="min-h-11 flex-[1_1_200px] rounded-full py-2.5"
					/>
				</div>
				<div className="flex flex-col gap-2">
					{shown.map((g) => (
						<GuestRow
							key={g.id}
							guest={g}
							isYou={g.userId === session.user.id}
							nowMs={nowMs}
							canNudge={published && !e.emailsHeld}
							paper={e.paper}
							eventId={eventId}
							eventTitle={e.title}
							nudging={nudge.isPending}
							onNudge={() => nudge.mutate({ eventId, guestId: g.id })}
							onRemove={() => remove.mutate({ eventId, guestId: g.id })}
						/>
					))}
				</div>
				<span className="text-[13px] text-haze">
					Showing {shown.length} of {plural(data.guests.length, "household")}
				</span>
			</section>
		</Page>
	);
}

function Count({
	value,
	label,
	tone,
}: {
	value: number;
	label: string;
	tone: string;
}) {
	return (
		<div>
			<div className={cn("numeral text-[28px]", tone)}>{value}</div>
			<div className="text-[13px] text-haze">{label}</div>
		</div>
	);
}

function party(g: Guest) {
	return [
		plural(g.adults, "adult"),
		...(g.kids > 0 ? [plural(g.kids, "kid")] : []),
	].join(" · ");
}

function GuestRow({
	guest: g,
	isYou,
	nowMs,
	canNudge,
	paper,
	eventId,
	eventTitle,
	nudging,
	onNudge,
	onRemove,
}: {
	guest: Guest;
	isYou: boolean;
	nowMs: number;
	canNudge: boolean;
	paper: boolean;
	eventId: string;
	eventTitle: string;
	nudging: boolean;
	onNudge: () => void;
	onRemove: () => void;
}) {
	const [confirming, setConfirming] = useState(false);
	const [editing, setEditing] = useState(false);
	const waiting = g.response === null;
	const out = g.response === "no";
	const sub = isYou
		? `That's you${g.respondedAt ? ` · ${ago(g.respondedAt, nowMs)}` : ""}`
		: waiting
			? g.invitedAt
				? `${g.email || "No email"} · invited ${shortDate(g.invitedAt)}`
				: paper
					? `${g.email || "No email"} · paper invite${g.hasPaper ? "" : ", not printed yet"}`
					: `${g.email} · not invited yet`
			: `${g.email || "No email"}${g.respondedAt ? ` · ${ago(g.respondedAt, nowMs)}` : ""}`;
	// Whose friend they are, for anybody the host did not choose.
	const via =
		g.source === "guest"
			? `Added by ${g.addedByName ?? "a guest"}`
			: g.source === "link"
				? "Joined by share link"
				: null;
	const note = [g.dietary, g.note ? `"${g.note}"` : ""].filter(Boolean);
	const coming = g.response === "yes" || g.response === "maybe";

	return (
		<div
			className={cn(
				"relative flex flex-wrap items-center gap-x-5 gap-y-2.5 rounded-[20px] px-5 py-4 max-md:pr-12 md:grid",
				// One fixed actions column per kind of event, so the tags line up
				// down the list whatever buttons a row has.
				paper
					? "md:grid-cols-[44px_minmax(0,1.3fr)_96px_110px_120px_minmax(0,1fr)_336px]"
					: "md:grid-cols-[44px_minmax(0,1.3fr)_96px_120px_140px_minmax(0,1fr)_220px]",
				waiting && "border border-line-strong border-dashed",
				out && "bg-panel-dim text-haze",
				!waiting && !out && "bg-panel",
			)}
		>
			<Avatar
				initials={initials(g.name)}
				tone={isYou ? "pink" : waiting ? "outline" : out ? "dim" : "plain"}
			/>
			<div className="min-w-0 flex-[1_1_200px]">
				<b className={cn("text-[17px]", out && "text-soft")}>{g.name}</b>
				<div className="truncate text-[13px] text-haze">{sub}</div>
				{via ? (
					<div className="truncate text-[12px] text-pink-soft">{via}</div>
				) : null}
				{g.noEmail ? <AddEmail eventId={eventId} guestId={g.id} /> : null}
			</div>
			{/* Every column is drawn on every row, empty or not, so the tags and
			    the counts line up down the list; the empties drop out on a phone,
			    where the row wraps anyway. */}
			<span className="flex w-[96px] flex-col items-start gap-1">
				<AnswerTag response={g.response} />
				{g.unreachable && !g.noEmail ? (
					<span className="rounded-full border border-pink px-2 py-px text-[11px] text-pink-soft">
						No email
					</span>
				) : null}
			</span>
			<span
				className={cn(
					"flex-[0_0_120px] text-[14px] text-soft",
					!coming && "max-md:hidden",
				)}
			>
				{coming ? party(g) : null}
			</span>
			<span
				className={cn(
					"flex-[0_0_140px] text-[14px] text-soft",
					!coming && "max-md:hidden",
				)}
			>
				{coming ? (
					g.bringing.length > 0 ? (
						g.bringing.join(", ")
					) : (
						<span className="text-haze">Nothing yet</span>
					)
				) : null}
			</span>
			<span
				className={cn(
					"min-w-0 flex-[1_1_160px] text-[14px]",
					g.dietary ? "text-pink-soft" : "text-soft",
					note.length === 0 && "max-md:hidden",
				)}
			>
				{note.join(" · ")}
			</span>
			<span className="flex items-center justify-end gap-1.5 max-md:empty:hidden md:ml-auto md:min-w-[40px]">
				{paper ? (
					<PaperActions eventId={eventId} eventTitle={eventTitle} guest={g} />
				) : null}
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label={`Edit ${g.name}'s answer`}
					aria-expanded={editing}
					className={editing ? "bg-ink/10 text-ink" : "text-haze"}
					onClick={() => setEditing((v) => !v)}
				>
					<Pencil strokeWidth={1.5} />
				</Button>
				{waiting && canNudge && g.invitedAt && !g.unreachable ? (
					<Button variant="pink" size="sm" disabled={nudging} onClick={onNudge}>
						Send a nudge
					</Button>
				) : null}
				{confirming ? (
					<>
						<Button variant="destructive" size="xs" onClick={onRemove}>
							Remove
						</Button>
						<Button
							variant="ghost"
							size="xs"
							onClick={() => setConfirming(false)}
						>
							Keep
						</Button>
					</>
				) : (
					<button
						type="button"
						aria-label={`Remove ${g.name}`}
						onClick={() => setConfirming(true)}
						className={cn(
							buttonVariants({ variant: "ghost", size: "icon-xs" }),
							// In the corner on a phone, so it does not take a line of
							// its own; in its column otherwise.
							"text-haze max-md:absolute max-md:top-3 max-md:right-3",
						)}
					>
						×
					</button>
				)}
			</span>
			{editing ? (
				<AnswerEditor
					eventId={eventId}
					guest={g}
					onDone={() => setEditing(false)}
				/>
			) : null}
		</div>
	);
}

/**
 * The paper side of an event: pick a size, download everybody's card in one
 * PDF, and -- once they have had time to arrive -- start the emails.
 */
function PaperPanel({
	eventId,
	title,
	published,
	held,
	releasedAt,
	emailable,
	onChange,
}: {
	eventId: string;
	title: string;
	published: boolean;
	held: boolean;
	releasedAt: Date | null;
	emailable: number;
	onChange: () => void;
}) {
	const [size, setSize] = usePaperSize();
	const [busy, setBusy] = useState(false);
	const [sure, setSure] = useState(false);
	const release = useMutation(
		orpc.events.releaseEmails.mutationOptions({
			onSuccess: (r) => {
				toast.success(
					`Emails started. Sent ${plural(r.sent, "invitation")}.${r.dryRun ? " (Logged, not sent: no mail key.)" : ""}`,
				);
				setSure(false);
				onChange();
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);
	return (
		<section className="flex flex-col gap-3.5 rounded-[26px] border border-lime/60 bg-panel p-[clamp(18px,3vw,28px)]">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h2 className="m-0 text-[20px]">Paper invitations</h2>
				<span className="text-[13px] text-haze">
					{held
						? "Emails are on hold, so the cards arrive first."
						: releasedAt
							? `Emails started ${shortDate(releasedAt)}.`
							: ""}
				</span>
			</div>
			<p className="m-0 text-[14px] text-soft">
				Each card has a QR code that signs that guest in to answer.
				{published ? "" : " The codes start working when you publish."}
			</p>
			<div className="flex flex-wrap items-center gap-2">
				<PaperSizeSelect value={size} onChange={setSize} />
				<Button
					variant="light"
					disabled={busy}
					onClick={async () => {
						setBusy(true);
						await downloadCards(eventId, title, size, null);
						setBusy(false);
					}}
				>
					{busy ? "Making the PDF..." : "Download all (PDF)"}
				</Button>
				{published && held ? (
					sure ? (
						<>
							<Button
								variant="send"
								disabled={release.isPending}
								onClick={() => release.mutate({ eventId })}
							>
								Yes, email {plural(emailable, "guest")}
							</Button>
							<Button variant="ghost" onClick={() => setSure(false)}>
								Not yet
							</Button>
						</>
					) : (
						<Button variant="send" onClick={() => setSure(true)}>
							Start emails
						</Button>
					)
				) : null}
			</div>
			{published && held ? (
				<span className="text-[13px] text-haze">
					Starting emails sends the invitation to everyone with an address who
					hasn't answered from their card yet, then reminders and updates run as
					usual. Guests a guest invites get email straight away; they have no
					card.
				</span>
			) : null}
		</section>
	);
}

/** The paper size, remembered per browser: it is the host's printer. */
function usePaperSize(): [PaperSize, (size: PaperSize) => void] {
	const [size, setSize] = useState<PaperSize>("card");
	useEffect(() => {
		try {
			const saved = localStorage.getItem("paper-size");
			if (saved === "card" || saved === "letter" || saved === "half") {
				setSize(saved);
			}
		} catch {
			// Storage may be blocked; the default is fine.
		}
	}, []);
	return [
		size,
		(next) => {
			setSize(next);
			try {
				localStorage.setItem("paper-size", next);
			} catch {
				// Not remembered, then.
			}
		},
	];
}

function PaperSizeSelect({
	value,
	onChange,
}: {
	value: PaperSize;
	onChange: (size: PaperSize) => void;
}) {
	return (
		<>
			<label htmlFor="paper-size" className="sr-only">
				Paper size
			</label>
			<select
				id="paper-size"
				value={value}
				onChange={(ev) => onChange(ev.target.value as PaperSize)}
				className="min-h-11 cursor-pointer rounded-full border border-line-strong bg-night px-4 py-2 text-[14px] text-ink [color-scheme:dark] hover:border-haze focus-visible:border-lime"
			>
				{PAPER_SIZES.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</select>
		</>
	);
}

/**
 * Fetch the cards' data (issuing any missing codes), build the PDF in the
 * browser, and save it. One guest, or everybody.
 */
async function downloadCards(
	eventId: string,
	title: string,
	size: PaperSize,
	guest: { id: string; name: string } | null,
) {
	// Only ever called from a click. Saying so lets the server build drop the
	// PDF library, which would otherwise ride along in the Worker for nothing.
	if (import.meta.env.SSR) return;
	try {
		const [data, pdf] = await Promise.all([
			client.events.paperInvites({
				eventId,
				guestIds: guest ? [guest.id] : undefined,
			}),
			import("@/lib/paper-pdf"),
		]);
		if (data.guests.length === 0) {
			toast.error("Nobody on the list yet.");
			return;
		}
		const file = await pdf.buildPaperInvites({
			event: data.event,
			guests: data.guests,
			size,
		});
		pdf.download(
			file,
			guest ? `${title} - ${guest.name}.pdf` : `${title} - invitations.pdf`,
		);
	} catch (error) {
		toast.error((error as Error).message || "The PDF didn't build.");
	}
}

/** One guest's card, and a fresh code when theirs got lost. */
function PaperActions({
	eventId,
	eventTitle,
	guest,
}: {
	eventId: string;
	eventTitle: string;
	guest: Guest;
}) {
	const queryClient = useQueryClient();
	const [busy, setBusy] = useState(false);
	const [size] = usePaperSize();
	const fresh = useMutation(
		orpc.guests.newPaperCode.mutationOptions({
			onSuccess: () => {
				toast.success(
					`New code for ${guest.name}. Their old card no longer works; download the new one.`,
				);
				queryClient.invalidateQueries({ queryKey: orpc.guests.key() });
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);
	return (
		<>
			<Button
				variant="outline"
				size="sm"
				disabled={busy}
				onClick={async () => {
					setBusy(true);
					await downloadCards(eventId, eventTitle, size, guest);
					setBusy(false);
				}}
			>
				Card
			</Button>
			{guest.hasPaper ? (
				<Button
					variant="ghost"
					size="xs"
					disabled={fresh.isPending}
					onClick={() => fresh.mutate({ eventId, guestId: guest.id })}
				>
					New code
				</Button>
			) : null}
		</>
	);
}

/** Give a name-only paper guest an address, so email can reach them later. */
function AddEmail({ eventId, guestId }: { eventId: string; guestId: string }) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const save = useMutation(
		orpc.guests.setEmail.mutationOptions({
			onSuccess: () => {
				setOpen(false);
				queryClient.invalidateQueries({ queryKey: orpc.guests.key() });
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);
	if (!open) {
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-lime hover:text-lime-soft"
			>
				+ Add email
			</button>
		);
	}
	return (
		<form
			className="mt-1.5 flex gap-1.5"
			onSubmit={(ev) => {
				ev.preventDefault();
				save.mutate({ eventId, guestId, email });
			}}
		>
			<Input
				type="email"
				required
				autoFocus
				aria-label="Their email"
				value={email}
				onChange={(ev) => setEmail(ev.target.value)}
				className="min-h-9 rounded-full px-3 py-1.5 text-[14px]"
			/>
			<Button type="submit" size="sm" disabled={save.isPending}>
				Save
			</Button>
		</form>
	);
}

const ANSWERS: { value: "yes" | "maybe" | "no" | "none"; label: string }[] = [
	{ value: "yes", label: "Yes" },
	{ value: "maybe", label: "Maybe" },
	{ value: "no", label: "Can't" },
	{ value: "none", label: "No reply" },
];

/**
 * A host recording a guest's answer -- they called, or they told you at the
 * pool. Spans the whole row; the guest's own notes and potluck picks stay
 * theirs.
 */
function AnswerEditor({
	eventId,
	guest,
	onDone,
}: {
	eventId: string;
	guest: Guest;
	onDone: () => void;
}) {
	const queryClient = useQueryClient();
	const [answer, setAnswer] = useState<"yes" | "maybe" | "no" | "none">(
		guest.response ?? "none",
	);
	const [adults, setAdults] = useState(guest.adults);
	const [kids, setKids] = useState(guest.kids);
	const save = useMutation(
		orpc.guests.setAnswer.mutationOptions({
			onSuccess: () => {
				toast.success(`Saved ${guest.name}'s answer.`);
				queryClient.invalidateQueries({ queryKey: orpc.guests.key() });
				onDone();
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);
	const coming = answer === "yes" || answer === "maybe";
	return (
		<form
			className="col-span-full flex basis-full flex-wrap items-end gap-3 border-line border-t pt-3"
			onSubmit={(ev) => {
				ev.preventDefault();
				save.mutate({
					eventId,
					guestId: guest.id,
					response: answer === "none" ? null : answer,
					adults,
					kids,
				});
			}}
		>
			<PillTabs
				label={`${guest.name}'s answer`}
				value={answer}
				onChange={setAnswer}
				options={ANSWERS}
			/>
			{coming ? (
				<div className="grid min-w-[300px] flex-1 grid-cols-2 gap-2">
					<Stepper
						label="Adults"
						value={adults}
						min={1}
						max={50}
						onChange={setAdults}
					/>
					<Stepper
						label="Kids"
						value={kids}
						min={0}
						max={50}
						onChange={setKids}
					/>
				</div>
			) : null}
			<div className="flex gap-2">
				<Button type="submit" size="sm" disabled={save.isPending}>
					Save
				</Button>
				<Button variant="ghost" size="sm" onClick={onDone}>
					Cancel
				</Button>
			</div>
		</form>
	);
}
