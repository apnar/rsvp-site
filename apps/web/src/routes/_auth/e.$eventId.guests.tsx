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
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AddGuests } from "@/components/add-guests";
import { Avatar } from "@/components/brand";
import { Page, PageHead } from "@/components/page";
import { PillTabs } from "@/components/pill-tabs";
import { AnswerTag, ResponseBar } from "@/components/response-bar";
import type { Outputs } from "@/lib/api-types";
import { ago, initials, plural, shortDate } from "@/lib/format";
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
						{published && t.waiting > 0 ? (
							<Button
								variant="pink"
								disabled={nudge.isPending}
								onClick={() => nudge.mutate({ eventId })}
							>
								Nudge {t.waiting}
							</Button>
						) : null}
						{published && notInvited > 0 ? (
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
					onAdded={() => refresh()}
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
							canNudge={published}
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
	nudging,
	onNudge,
	onRemove,
}: {
	guest: Guest;
	isYou: boolean;
	nowMs: number;
	canNudge: boolean;
	nudging: boolean;
	onNudge: () => void;
	onRemove: () => void;
}) {
	const [confirming, setConfirming] = useState(false);
	const waiting = g.response === null;
	const out = g.response === "no";
	const sub = isYou
		? `That's you${g.respondedAt ? ` · ${ago(g.respondedAt, nowMs)} ago` : ""}`
		: waiting
			? g.invitedAt
				? `${g.email} · invited ${shortDate(g.invitedAt)}`
				: `${g.email} · not invited yet`
			: `${g.email}${g.respondedAt ? ` · ${ago(g.respondedAt, nowMs)} ago` : ""}`;
	const note = [g.dietary, g.note ? `"${g.note}"` : ""].filter(Boolean);

	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-x-5 gap-y-2.5 rounded-[20px] px-5 py-4",
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
			</div>
			<AnswerTag response={g.response} />
			{g.unreachable ? (
				<span className="rounded-full border border-pink px-2.5 py-0.5 text-[12px] text-pink-soft">
					No email
				</span>
			) : null}
			{g.response === "yes" || g.response === "maybe" ? (
				<>
					<span className="flex-[0_0_120px] text-[14px] text-soft">
						{party(g)}
					</span>
					<span className="flex-[0_0_140px] text-[14px] text-soft">
						{g.bringing.length > 0 ? (
							g.bringing.join(", ")
						) : (
							<span className="text-haze">Nothing yet</span>
						)}
					</span>
				</>
			) : null}
			{note.length > 0 ? (
				<span
					className={cn(
						"flex-[1_1_220px] text-[14px]",
						g.dietary ? "text-pink-soft" : "text-soft",
					)}
				>
					{note.join(" · ")}
				</span>
			) : waiting ? (
				<span className="flex-[1_1_120px]" />
			) : null}
			<span className="flex items-center gap-1.5">
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
							"text-haze",
						)}
					>
						×
					</button>
				)}
			</span>
		</div>
	);
}
