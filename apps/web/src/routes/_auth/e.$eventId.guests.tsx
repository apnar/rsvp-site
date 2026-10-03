import { formatDate } from "@rsvp-site/api/time";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { cn } from "@rsvp-site/ui/lib/utils";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AddGuests } from "@/components/add-guests";
import { GuestRow, type RowEvent } from "@/components/guest-list/guest-row";
import { Notice } from "@/components/notice";
import { Page, PageHead } from "@/components/page";
import { PaperPanel } from "@/components/paper/paper-panel";
import { usePrint } from "@/components/paper/use-print";
import { PillTabs } from "@/components/pill-tabs";
import { ResponseBar } from "@/components/response-bar";
import { StatTile } from "@/components/stat-tile";
import {
	ANSWER_LABELS,
	COUNT_LABELS,
	DRY_RUN_SUFFIX,
	pageTitle,
} from "@/content/site";
import { refreshCard } from "@/lib/design-card";
import { capitalize, matchesPerson, plural } from "@/lib/format";
import { orNotFound } from "@/lib/not-found";
import { saveFile } from "@/lib/save-file";
import { orpc } from "@/utils/orpc";

const FILTERS = ["yes", "maybe", "no", "waiting"] as const;

const guestListQuery = (eventId: string) =>
	orpc.guests.list.queryOptions({ input: { eventId } });

export const Route = createFileRoute("/_auth/e/$eventId/guests")({
	// The filter is in the URL so Back and a refresh keep it; "all" is the
	// absence of it.
	validateSearch: z.object({
		show: z.enum(FILTERS).optional().catch(undefined),
	}),
	loader: ({ context, params }) =>
		orNotFound(
			context.queryClient.ensureQueryData(guestListQuery(params.eventId)),
		),
	head: ({ loaderData }) => ({
		meta: [
			{
				title: pageTitle(loaderData && "Guests", loaderData?.event.title),
			},
		],
	}),
	component: GuestListPage,
});

function GuestListPage() {
	const { eventId } = Route.useParams();
	const { session } = Route.useRouteContext();
	const { data } = useSuspenseQuery(guestListQuery(eventId));
	const { show: filter = "all" } = Route.useSearch();
	const navigate = Route.useNavigate();
	const [query, setQuery] = useState("");
	const [adding, setAdding] = useState(false);
	const nowMs = Date.parse(data.now);
	const t = data.totals;
	const e = data.event;
	// Once, here: each caller reads the saved choice on its own, so separate
	// hooks in the panel and the rows would disagree after a change.
	const [print, setPrint] = usePrint(e.designFormat);
	// A backstop for the card picture emails show: if the facts moved some
	// way the editor didn't catch, it is drawn again here, quietly.
	useEffect(() => {
		if (e.designFormat) refreshCard(eventId, true).catch(() => {});
	}, [eventId, e.designFormat]);
	const published = e.status === "published";
	const { notInvited } = data;

	const nudge = useMutation(
		orpc.events.nudge.mutationOptions({
			onSuccess: (r) => {
				toast.success(
					r.sent > 0
						? `Nudged ${plural(r.sent, "guest")}.`
						: "Already nudged in the last 12 hours.",
				);
			},
		}),
	);
	const send = useMutation(
		orpc.events.send.mutationOptions({
			onSuccess: (r) => {
				toast.success(
					r.sent > 0
						? `Invited ${plural(r.sent, "more guest")}.${r.dryRun ? DRY_RUN_SUFFIX : ""}`
						: "Nobody new to invite.",
				);
			},
		}),
	);
	const remove = useMutation(orpc.guests.remove.mutationOptions());
	const exportCsv = useMutation(
		orpc.events.exportCsv.mutationOptions({
			onSuccess: ({ csv, fileName }) =>
				saveFile(new Blob([csv], { type: "text/csv;charset=utf-8" }), fileName),
		}),
	);

	const shown = useMemo(() => {
		return data.guests.filter((g) => {
			if (
				filter === "waiting"
					? g.response !== null
					: filter !== "all" && g.response !== filter
			) {
				return false;
			}
			return matchesPerson(g, query);
		});
	}, [data.guests, filter, query]);

	// What every row shares about the event, so a row takes one object
	// instead of repeating the event's facts as separate props.
	const rowEvent: RowEvent = {
		id: eventId,
		title: e.title,
		paper: e.paper,
		canNudge: published && !e.emailsHeld,
		nowMs,
		print,
	};

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
						<Button
							variant="outline"
							disabled={exportCsv.isPending}
							onClick={() => exportCsv.mutate({ eventId })}
						>
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
				/>
			) : null}

			{e.paper ? (
				<PaperPanel
					event={e}
					emailable={notInvited}
					print={print}
					onPrint={setPrint}
				/>
			) : null}

			{e.status === "draft" ? (
				<Notice>
					This is a draft. Nobody has been invited yet.{" "}
					<Link to="/e/$eventId/edit" params={{ eventId }}>
						Finish it and send
					</Link>
					.
				</Notice>
			) : null}

			<section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3.5">
				<div className="flex flex-col gap-1.5 rounded-[26px] bg-lime p-[22px] text-on-lime">
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
						<StatTile
							compact
							value={t.yes}
							label={COUNT_LABELS.yes}
							tone="lime"
						/>
						<StatTile
							compact
							value={t.maybe}
							label={COUNT_LABELS.maybe}
							tone="pink"
						/>
						<StatTile compact value={t.no} label={COUNT_LABELS.no} />
						<StatTile
							compact
							value={t.waiting}
							label={COUNT_LABELS.waiting}
							tone="haze"
						/>
					</div>
					<span className="text-[13px] text-haze">
						{plural(t.invited, "guest")} invited
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
													item.left === 0 && "text-lime-ink",
													item.claimed === 0 && "text-pink-ink",
												)}
											>
												{item.claimed}/{item.quantity}
											</b>
										</div>
										<div
											className="h-1.5 rounded-full"
											style={{
												background: `linear-gradient(90deg, var(--color-lime) ${pct}%, var(--color-line) ${pct}%)`,
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
						onChange={(next) =>
							navigate({
								search: (prev) => ({
									...prev,
									show: next === "all" ? undefined : next,
								}),
							})
						}
						options={[
							{ value: "all", label: "All", count: t.invited },
							{
								value: "yes",
								label: capitalize(COUNT_LABELS.yes),
								count: t.yes,
							},
							{
								value: "maybe",
								label: capitalize(COUNT_LABELS.maybe),
								count: t.maybe,
							},
							{ value: "no", label: capitalize(COUNT_LABELS.no), count: t.no },
							{
								value: "waiting",
								label: ANSWER_LABELS.none,
								count: t.waiting,
							},
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
							familyOnList={
								g.familyId !== null &&
								data.guests.some(
									(o) => o.id !== g.id && o.familyId === g.familyId,
								)
							}
							key={g.id}
							guest={g}
							isYou={g.userId === session.user.id}
							event={rowEvent}
							nudging={nudge.isPending}
							onNudge={() => nudge.mutate({ eventId, guestId: g.id })}
							onRemove={() => remove.mutate({ eventId, guestId: g.id })}
							removing={remove.isPending}
						/>
					))}
				</div>
				<span className="text-[13px] text-haze">
					Showing {shown.length} of {plural(data.guests.length, "guest")}
				</span>
			</section>
		</Page>
	);
}
