import { extraPeople } from "@rsvp-site/api/headcount";
import { canHost, isAdmin } from "@rsvp-site/db/roles";
import { Button, buttonVariants } from "@rsvp-site/ui/components/button";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { ConfirmAction } from "@/components/confirm-action";
import { EventCard } from "@/components/event-card";
import { Page, PageHead, Panel } from "@/components/page";
import { PillTabs } from "@/components/pill-tabs";
import { AnswerTag } from "@/components/response-bar";
import { StatTile } from "@/components/stat-tile";
import { pageTitle } from "@/content/site";
import { firstName, longDay, since } from "@/lib/format";
import { orpc } from "@/utils/orpc";

const mineQuery = (all: boolean) =>
	orpc.events.mine.queryOptions({ input: { all } });
const invitesQuery = () => orpc.events.invites.queryOptions();

export const Route = createFileRoute("/_auth/events")({
	// Both live in the URL so Back and a refresh keep the view. The default
	// tab is left out of it, which is why `tab` is optional rather than
	// defaulted here.
	validateSearch: z.object({
		all: z.boolean().optional().catch(undefined),
		tab: z.enum(["drafts", "past"]).optional().catch(undefined),
	}),
	loaderDeps: ({ search }) => ({ all: search.all ?? false }),
	loader: async ({ context, deps }) => {
		const host = canHost(context.session.user);
		await Promise.all([
			context.queryClient.ensureQueryData(invitesQuery()),
			host ? context.queryClient.ensureQueryData(mineQuery(deps.all)) : null,
		]);
	},
	head: () => ({ meta: [{ title: pageTitle("Your events") }] }),
	component: EventsPage,
});

function EventsPage() {
	const { session } = Route.useRouteContext();
	return canHost(session.user) ? <HostDashboard /> : <Invites />;
}

function HostDashboard() {
	const { session } = Route.useRouteContext();
	const { all = false, tab = "upcoming" } = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data } = useSuspenseQuery(mineQuery(all));

	const nudge = useMutation(
		orpc.events.nudge.mutationOptions({
			onSuccess: (result) => {
				toast.success(
					result.sent > 0
						? `Nudged ${result.sent}.`
						: "Everyone was nudged in the last 12 hours.",
				);
			},
		}),
	);

	const n = data.upcoming.length;
	const name = firstName(session.user.name);
	const title =
		n === 0
			? `Nothing on deck yet, ${name}.`
			: n === 1
				? `One party on deck, ${name}.`
				: `${n} parties on deck, ${name}.`;
	const shown =
		tab === "upcoming"
			? data.upcoming
			: tab === "drafts"
				? data.drafts
				: data.past;
	const draft = data.drafts[0];

	return (
		<Page>
			<PageHead
				kicker={longDay(data.now)}
				title={title}
				actions={
					<Link
						to="/e/new"
						className={buttonVariants({
							size: "lg",
							className: "font-heading shadow-lime",
						})}
					>
						+ New event
					</Link>
				}
			/>

			<section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-3">
				<StatTile
					value={data.tiles.newReplies}
					tone="lime"
					label="new replies since yesterday"
				/>
				<StatTile
					value={data.tiles.deciding}
					tone="pink"
					label="people still deciding"
				/>
				<StatTile value={data.tiles.openSlots} label="potluck slots open" />
			</section>

			<section className="flex flex-col gap-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="m-0 text-[26px]">
						{tab === "upcoming"
							? "Upcoming"
							: tab === "drafts"
								? "Drafts"
								: "Past"}
					</h2>
					<div className="flex flex-wrap items-center gap-2">
						{isAdmin(session.user) ? (
							<Button
								variant="ghost"
								size="sm"
								onClick={() =>
									navigate({
										search: (prev) => ({
											...prev,
											all: all ? undefined : true,
										}),
									})
								}
							>
								{all ? "Only mine" : "Every event"}
							</Button>
						) : null}
						<PillTabs
							label="Which events"
							value={tab}
							onChange={(next) =>
								navigate({
									search: (prev) => ({
										...prev,
										tab: next === "upcoming" ? undefined : next,
									}),
								})
							}
							options={[
								{
									value: "upcoming",
									label: "Upcoming",
									count: data.upcoming.length,
								},
								{ value: "drafts", label: "Drafts", count: data.drafts.length },
								{ value: "past", label: "Past", count: data.past.length },
							]}
						/>
					</div>
				</div>
				{shown.length === 0 ? (
					<p className="m-0 rounded-[26px] border border-line-strong border-dashed p-6 text-soft">
						{tab === "upcoming"
							? "Nothing coming up. Start one and it lands here."
							: tab === "drafts"
								? "No drafts. Everything you started has gone out."
								: "No past events yet."}
					</p>
				) : (
					<div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,330px),1fr))] gap-5">
						{shown.map((event) => (
							<EventCard
								key={event.id}
								event={event}
								today={data.today}
								badge={
									event.status === "draft"
										? { label: "Draft", tone: "pink" }
										: undefined
								}
								actions={
									<>
										<Link
											to="/e/$eventId/guests"
											params={{ eventId: event.id }}
											className={buttonVariants({
												variant: "light",
												size: "sm",
												className: "flex-1",
											})}
										>
											Guest list
										</Link>
										{event.status === "published" &&
										event.totals.waiting > 0 &&
										tab === "upcoming" ? (
											<Button
												variant="outline"
												size="sm"
												className="flex-1"
												disabled={nudge.isPending}
												onClick={() => nudge.mutate({ eventId: event.id })}
											>
												Nudge {event.totals.waiting}
											</Button>
										) : event.status === "canceled" ? (
											<Link
												to="/e/$eventId"
												params={{ eventId: event.id }}
												className={buttonVariants({
													variant: "outline",
													size: "sm",
													className: "flex-1",
												})}
											>
												View
											</Link>
										) : (
											<Link
												to="/e/$eventId/edit"
												params={{ eventId: event.id }}
												className={buttonVariants({
													variant: "outline",
													size: "sm",
													className: "flex-1",
												})}
											>
												{event.status === "draft" ? "Finish it" : "Edit"}
											</Link>
										)}
										{event.status === "draft" ? (
											<DeleteDraft eventId={event.id} />
										) : null}
									</>
								}
							/>
						))}
					</div>
				)}
			</section>

			<section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-5">
				<Panel className="gap-1 border border-line">
					<h2 className="m-0 mb-2.5 text-[20px]">Fresh replies</h2>
					{data.fresh.length === 0 ? (
						<p className="m-0 border-line border-t pt-3 text-soft">
							No replies yet. They'll show up here as they land.
						</p>
					) : (
						data.fresh.map((f) => (
							<Link
								key={f.guestId}
								to="/e/$eventId/guests"
								params={{ eventId: f.eventId }}
								className="flex items-center gap-3 border-line border-t py-3 text-ink no-underline hover:text-ink"
							>
								<AnswerTag response={f.response} words={f.words} />
								<span className="min-w-0 flex-1 text-[15px]">
									<b>{f.name}</b>
									{f.response === "yes" && extraPeople(f) > 0
										? ` +${extraPeople(f)}`
										: ""}{" "}
									· {f.eventTitle}
								</span>
								<span className="text-[13px] text-haze">
									{f.respondedAt
										? since(f.respondedAt, Date.parse(data.now))
										: ""}
								</span>
							</Link>
						))
					)}
				</Panel>
				{draft ? (
					<div className="flex flex-col justify-center gap-3 rounded-[26px] border border-line-strong border-dashed p-[22px]">
						<span className="kicker text-pink-ink">Draft</span>
						<h2 className="m-0 text-[24px]">{draft.title}</h2>
						<span className="text-[15px] text-soft">
							{draft.date ? "Not sent yet." : "No date yet."} Pick up where you
							left off.
						</span>
						<Link
							to="/e/$eventId/edit"
							params={{ eventId: draft.id }}
							className={buttonVariants({
								variant: "secondary",
								size: "sm",
								className: "self-start",
							})}
						>
							Finish it
						</Link>
					</div>
				) : null}
			</section>

			<InvitedTo />
		</Page>
	);
}

/** Events the caller is a guest at. A host's own section, a user's whole page. */
function InvitedTo({ heading = true }: { heading?: boolean }) {
	const { data } = useSuspenseQuery(invitesQuery());
	if (heading && data.upcoming.length === 0) return null;
	return (
		<section className="flex flex-col gap-4">
			{heading ? <h2 className="m-0 text-[26px]">Invited to</h2> : null}
			{data.upcoming.length === 0 ? (
				<p className="m-0 rounded-[26px] border border-line-strong border-dashed p-6 text-soft">
					No invitations right now. When someone invites you, it shows up here
					and in your inbox.
				</p>
			) : (
				<div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,330px),1fr))] gap-5">
					{data.upcoming.map((event) => (
						<EventCard
							key={event.id}
							event={event}
							today={data.today}
							actions={
								<Link
									to="/e/$eventId"
									params={{ eventId: event.id }}
									className={buttonVariants({
										variant: event.myResponse ? "light" : "default",
										size: "sm",
										className: "flex-1",
									})}
								>
									{event.myResponse ? (
										<>
											You said{" "}
											<AnswerTag
												response={event.myResponse}
												words={event.answers.words}
											/>
										</>
									) : (
										"Answer"
									)}
								</Link>
							}
						/>
					))}
				</div>
			)}
		</section>
	);
}

function Invites() {
	const { session } = Route.useRouteContext();
	const { data } = useSuspenseQuery(invitesQuery());
	return (
		<Page>
			<PageHead
				kicker="My invites"
				title={
					data.upcoming.length > 0
						? `You're wanted, ${firstName(session.user.name)}.`
						: `Hi, ${firstName(session.user.name)}.`
				}
			/>
			<InvitedTo heading={false} />
			{data.past.length > 0 ? (
				<section className="flex flex-col gap-3">
					<h2 className="m-0 text-[22px]">Been there</h2>
					{data.past.map((e) => (
						<Link
							key={e.id}
							to="/e/$eventId"
							params={{ eventId: e.id }}
							className="flex items-center gap-3 rounded-[20px] bg-panel px-5 py-4 text-ink no-underline hover:text-ink"
						>
							<span className="min-w-0 flex-1">
								<b>{e.title}</b>
								<span className="block text-[13px] text-haze">
									{e.dateLabel}
								</span>
							</span>
							<AnswerTag response={e.myResponse} words={e.answers.words} />
						</Link>
					))}
				</section>
			) : null}
		</Page>
	);
}

/**
 * A draft's delete, on its card: every host of a draft may delete it, and
 * nothing has gone to anybody, so a plain "are you sure?" is enough.
 */
function DeleteDraft({ eventId }: { eventId: string }) {
	const remove = useMutation(
		orpc.events.remove.mutationOptions({
			onSuccess: () => toast.success("Draft deleted."),
		}),
	);
	return (
		<ConfirmAction
			confirm="Delete it"
			pending={remove.isPending}
			onConfirm={() => remove.mutate({ eventId })}
			trigger={{ variant: "ghost", size: "sm", children: "Delete" }}
			className="flex basis-full gap-1.5"
		/>
	);
}
