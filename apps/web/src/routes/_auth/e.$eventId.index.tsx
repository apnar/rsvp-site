import { Button, buttonVariants } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { Textarea } from "@rsvp-site/ui/components/textarea";
import { cn } from "@rsvp-site/ui/lib/utils";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Wordmark } from "@/components/brand";
import {
	type Answer,
	AnswerPicker,
	Field,
	Stepper,
} from "@/components/controls";
import { CountdownTiles } from "@/components/countdown";
import { Cover } from "@/components/cover";
import { CardSvg } from "@/components/design/card-svg";
import { DesignTheme } from "@/components/design/design-theme";
import { AnswerTag, ResponseBar } from "@/components/response-bar";
import UserMenu from "@/components/user-menu";
import type { Outputs } from "@/lib/api-types";
import { plural } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/e/$eventId/")({
	// `a` is the answer an email button carried. It is shown picked but not
	// saved: mail clients fetch links on their own, so nothing is recorded
	// until a person presses the button.
	validateSearch: z.object({ a: z.enum(["yes", "maybe", "no"]).optional() }),
	loader: ({ context, params }) =>
		context.queryClient.ensureQueryData(
			orpc.events.invite.queryOptions({ input: { eventId: params.eventId } }),
		),
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData
					? `${loaderData.event.title} · Botch RSVP`
					: "Botch RSVP",
			},
			// The page is behind a sign-in, but say it anyway.
			{ name: "robots", content: "noindex" },
			...(loaderData?.design
				? [{ name: "theme-color", content: loaderData.design.theme.bg }]
				: []),
		],
	}),
	component: InvitePage,
});

type Invite = Outputs["events"]["invite"];

function firstName(name: string) {
	return name.trim().split(/\s+/)[0] ?? name;
}

/** "The Nguyens, Priya S., the Okafors, Coach Dana and 38 more" */
function crowdLine(names: string[], shown = 4): string {
	if (names.length === 0) return "";
	if (names.length <= shown) {
		return names.length === 1
			? (names[0] ?? "")
			: `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
	}
	return `${names.slice(0, shown).join(", ")} and ${names.length - shown} more`;
}

/** End with a period, unless a name already did ("Marcus T."). */
function sentence(text: string): string {
	return /[.!?]$/.test(text) ? text : `${text}.`;
}

function InvitePage() {
	const { eventId } = Route.useParams();
	const { a } = Route.useSearch();
	const { data } = useSuspenseQuery(
		orpc.events.invite.queryOptions({ input: { eventId } }),
	);
	const e = data.event;
	const canceled = e.status === "canceled";

	const header = (
		<header className="relative mx-auto flex w-full max-w-[1180px] items-center gap-4 px-[clamp(16px,4vw,40px)] py-[18px]">
			<Link to="/events" className="mr-auto no-underline">
				<Wordmark />
			</Link>
			<Link
				to="/events"
				className="font-medium text-[14px] text-ink no-underline hover:text-lime-ink"
			>
				{data.isHost ? "My events" : "My invites"}
			</Link>
			<UserMenu />
		</header>
	);
	const status = (align: string) => (
		<span
			className={cn(
				align,
				"rounded-full px-3.5 py-1.5 font-bold text-[13px] uppercase tracking-[0.08em]",
				canceled
					? "bg-ink text-night"
					: data.me
						? "bg-lime text-on-lime"
						: "bg-pink text-on-pink",
			)}
		>
			{canceled
				? "Canceled"
				: data.me
					? "You're on the list"
					: e.status === "draft"
						? "Draft · only hosts see this"
						: "You're hosting"}
		</span>
	);
	const facts = (align?: string) => (
		<div
			className={cn(
				"flex flex-wrap gap-x-7 gap-y-2 font-medium text-[17px]",
				align,
			)}
		>
			{e.dateLabel ? <span>{e.dateLabel}</span> : null}
			{e.timeLabel ? (
				<span className="text-lime-ink">{e.timeLabel}</span>
			) : null}
			{e.location ? <span>{e.location}</span> : null}
			{e.hostLine ? (
				<span className="text-haze">Hosted by {e.hostLine}</span>
			) : null}
		</div>
	);

	return (
		<div>
			{data.design ? (
				<section className="relative flex flex-col">
					<DesignTheme theme={data.design.theme} />
					{header}
					<div className="mx-auto flex w-full max-w-[1180px] flex-col items-center gap-5 px-[clamp(16px,4vw,40px)] pt-2 pb-9 text-center">
						<CardSvg
							scene={data.design.scene}
							className={cn(
								"h-auto w-full rounded-[6px] shadow-float",
								data.design.scene.w > data.design.scene.h
									? "max-w-[860px]"
									: "max-w-[560px]",
							)}
						/>
						<h1 className="sr-only">{e.title}</h1>
						{status("self-center")}
						{facts("justify-center")}
					</div>
				</section>
			) : (
				<section className="relative flex min-h-[min(86vh,760px)] flex-col overflow-hidden">
					<div className="absolute inset-0">
						<Cover coverKey={e.coverKey} />
					</div>
					<div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-night)_55%,transparent)_0%,color-mix(in_oklab,var(--color-night)_20%,transparent)_40%,var(--color-night)_100%)]" />
					{header}
					<div className="relative mx-auto mt-auto flex w-full max-w-[1180px] flex-col gap-[18px] px-[clamp(16px,4vw,40px)] pb-9">
						{status("self-start")}
						<h1 className="m-0 max-w-[14ch] font-black text-[clamp(40px,7.4vw,96px)] leading-[0.95] tracking-[-0.04em]">
							{e.title}
						</h1>
						{facts()}
					</div>
				</section>
			)}

			<div className="mx-auto flex max-w-[1180px] flex-col gap-[clamp(40px,6vw,72px)] px-[clamp(16px,4vw,40px)] pt-4 pb-20">
				{canceled ? null : (
					<CountdownTiles
						nowIso={data.now}
						startsAtIso={data.startsAt}
						tiles={[
							{ value: data.totals.yes, label: "said yes" },
							{ value: data.headcount, label: "coming" },
							...(e.potluckEnabled
								? [
										{
											value: data.potluck.reduce((n, l) => n + l.left, 0),
											label: "to bring",
											tone: "pink" as const,
										},
									]
								: []),
						]}
					/>
				)}

				<section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-start gap-[clamp(32px,5vw,64px)]">
					{data.me && !canceled ? (
						<div className="flex flex-col gap-5">
							<RsvpForm data={data} initial={a ?? null} />
							<BringSomeone data={data} />
						</div>
					) : (
						<HostPanel data={data} />
					)}
					<div className="flex flex-col gap-10">
						{e.details ? (
							<section className="flex flex-col gap-3">
								<h2 className="m-0 text-[28px]">The details</h2>
								{e.details.split(/\n{2,}/).map((para) => (
									<p
										key={para}
										className="m-0 whitespace-pre-line text-[17px] text-soft"
									>
										{para}
									</p>
								))}
							</section>
						) : null}
						<section className="flex flex-col gap-3.5">
							<h2 className="m-0 text-[28px]">The crowd</h2>
							<ResponseBar totals={data.totals} className="h-3.5 bg-panel" />
							<div className="flex flex-wrap gap-x-[18px] gap-y-1.5 text-[14px] text-soft">
								<span>
									<b className="text-lime-ink">{data.totals.yes}</b> in
								</span>
								<span>
									<b className="text-pink-ink">{data.totals.maybe}</b> maybe
								</span>
								<span>
									<b className="text-ink">{data.totals.no}</b> can't
								</span>
								<span>
									<b className="text-ink">{data.totals.waiting}</b> deciding
								</span>
							</div>
							{data.crowd.yes.length > 0 ? (
								<span className="text-[15px] text-soft">
									{sentence(crowdLine(data.crowd.yes))}
									{data.crowd.maybe.length > 0
										? ` Maybe: ${sentence(crowdLine(data.crowd.maybe, 3))}`
										: ""}
								</span>
							) : null}
						</section>
					</div>
				</section>
			</div>
		</div>
	);
}

/** What a host sees in place of the form: how to get to the controls. */
function HostPanel({ data }: { data: Invite }) {
	const e = data.event;
	return (
		<section className="flex flex-col gap-4 rounded-[28px] border border-line bg-panel p-[clamp(20px,3vw,32px)]">
			<span className="kicker text-lime-ink">
				{e.status === "canceled" ? "Canceled" : "Host view"}
			</span>
			<h2 className="m-0 text-[30px]">
				{e.status === "canceled"
					? "This one's off."
					: "This is what your guests see."}
			</h2>
			{data.isHost ? (
				<div className="flex flex-wrap gap-2">
					<Link
						to="/e/$eventId/guests"
						params={{ eventId: e.id }}
						className={buttonVariants({ variant: "light" })}
					>
						Guest list
					</Link>
					{e.status === "canceled" ? null : (
						<Link
							to="/e/$eventId/edit"
							params={{ eventId: e.id }}
							className={buttonVariants({ variant: "outline" })}
						>
							Edit
						</Link>
					)}
				</div>
			) : (
				<p className="m-0 text-soft">Nothing to answer. Sorry to miss you.</p>
			)}
		</section>
	);
}

function RsvpForm({ data, initial }: { data: Invite; initial: Answer | null }) {
	const queryClient = useQueryClient();
	const e = data.event;
	const me = data.me;
	const saved = me?.response ?? null;
	const [answer, setAnswer] = useState<Answer | null>(initial ?? saved);
	const [adults, setAdults] = useState(me?.adults ?? 1);
	const [kids, setKids] = useState(me?.kids ?? 0);
	const [dietary, setDietary] = useState(me?.dietary ?? "");
	const [note, setNote] = useState(me?.note ?? "");
	const [claims, setClaims] = useState<string[]>(me?.claims ?? []);

	const respond = useMutation(
		orpc.guests.respond.mutationOptions({
			onSuccess: async (result) => {
				await queryClient.invalidateQueries({
					queryKey: orpc.events.key(),
				});
				if (result.full.length > 0) {
					setClaims((c) => c.filter((id) => !result.full.includes(id)));
					toast.warning(
						"Saved, but someone beat you to a potluck slot. Pick another?",
					);
				} else {
					toast.success(
						answer === "no" ? "Got it. They'll miss you." : "Locked in.",
					);
				}
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);

	if (!me) return null;
	const pending = answer !== null && answer !== saved;
	const coming = answer === "yes" || answer === "maybe";

	return (
		<form
			className="flex flex-col gap-[22px] rounded-[28px] border border-line bg-panel p-[clamp(20px,3vw,32px)]"
			onSubmit={(ev) => {
				ev.preventDefault();
				if (!answer) {
					toast.error("Yes, maybe or can't?");
					return;
				}
				respond.mutate({
					eventId: e.id,
					response: answer,
					adults,
					kids,
					dietary,
					note,
					claims,
				});
			}}
		>
			<div>
				{e.deadlineLabel ? (
					<span className="kicker text-lime-ink">
						RSVP by {e.deadlineLabel}
					</span>
				) : null}
				<h2 className="mt-1.5 mb-0 text-[30px]">
					You coming, {firstName(me.name)}?
				</h2>
			</div>
			<AnswerPicker value={answer} onChange={setAnswer} pending={pending} />

			{coming && (e.maxPlusOnes > 0 || e.askKids) ? (
				<div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
					{e.maxPlusOnes > 0 ? (
						<Stepper
							label="Adults"
							value={adults}
							min={1}
							max={1 + e.maxPlusOnes}
							onChange={setAdults}
						/>
					) : null}
					{e.askKids ? (
						<Stepper
							label="Kids"
							value={kids}
							min={0}
							max={20}
							onChange={setKids}
						/>
					) : null}
				</div>
			) : null}

			{coming && e.askDietary ? (
				<Field label="Dietary notes" htmlFor="dietary">
					<Input
						id="dietary"
						value={dietary}
						maxLength={300}
						placeholder="Allergies, vegetarians, anything the hosts should know"
						onChange={(ev) => setDietary(ev.target.value)}
					/>
				</Field>
			) : null}

			{coming && e.potluckEnabled && data.potluck.length > 0 ? (
				<fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
					<legend className="mb-2 p-0 text-[13px] text-haze">
						Potluck: claim one
					</legend>
					{data.potluck.map((item) => {
						const mine = claims.includes(item.id);
						const left = item.left + (item.mine ? 1 : 0) - (mine ? 1 : 0);
						const full = !mine && left === 0;
						return (
							<label
								key={item.id}
								className={cn(
									"flex cursor-pointer items-center justify-between gap-3 rounded-[14px] border px-4 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lime",
									mine
										? "border-pink bg-pink/14"
										: "border-line hover:border-line-strong",
									full && "cursor-not-allowed opacity-50",
								)}
							>
								<input
									type="checkbox"
									className="sr-only"
									checked={mine}
									disabled={full}
									onChange={(ev) =>
										setClaims((c) =>
											ev.target.checked
												? [...c, item.id]
												: c.filter((id) => id !== item.id),
										)
									}
								/>
								<span className={mine ? "font-bold" : ""}>{item.label}</span>
								<span
									className={cn(
										"text-[13px]",
										mine ? "text-pink-soft" : "text-haze",
									)}
								>
									{mine
										? "Yours"
										: full
											? "Taken"
											: `${left} of ${item.quantity} left`}
								</span>
							</label>
						);
					})}
				</fieldset>
			) : null}

			{e.askNote ? (
				<Field label="Note for the hosts" htmlFor="note">
					<Textarea
						id="note"
						value={note}
						maxLength={1000}
						onChange={(ev) => setNote(ev.target.value)}
					/>
				</Field>
			) : null}

			<Button
				type="submit"
				variant="send"
				size="lg"
				disabled={respond.isPending}
			>
				{respond.isPending
					? "Saving..."
					: saved && !pending
						? "Update my answer"
						: "Lock it in"}
			</Button>
		</form>
	);
}

/**
 * Inviting a friend, for guests the hosts chose, when the party allows it.
 * People a guest brings see none of this: they get their own plus-ones and
 * nothing more, which is what keeps the list from running away.
 */
function BringSomeone({ data }: { data: Invite }) {
	const queryClient = useQueryClient();
	const [email, setEmail] = useState("");
	const me = data.me;
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: orpc.events.key() });
	const invite = useMutation(
		orpc.guests.inviteFriend.mutationOptions({
			onSuccess: (r) => {
				toast.success(
					r.emailed
						? "Invited. They'll get an email from us."
						: "Added. They don't get email from us, so tell them yourself.",
				);
				setEmail("");
				refresh();
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);
	const takeBack = useMutation(
		orpc.guests.uninviteFriend.mutationOptions({
			onSuccess: refresh,
			onError: (error: Error) => toast.error(error.message),
		}),
	);
	if (!me || (!me.canInvite && me.friends.length === 0)) return null;

	return (
		<section className="flex flex-col gap-3.5 rounded-[28px] border border-line border-dashed p-[clamp(20px,3vw,28px)]">
			<div>
				<span className="kicker text-pink-ink">Bring someone</span>
				<h2 className="mt-1.5 mb-0 text-[22px]">Know who'd love this?</h2>
			</div>
			{me.friends.length > 0 ? (
				<ul className="m-0 flex list-none flex-col gap-1 p-0">
					{me.friends.map((f) => (
						<li
							key={f.guestId}
							className="flex items-center gap-3 border-line border-t py-2.5 text-[15px]"
						>
							<span className="min-w-0 flex-1 truncate">
								<b>{f.name}</b>{" "}
								<span className="text-[13px] text-haze">{f.email}</span>
							</span>
							<AnswerTag response={f.response} />
							{f.response === null ? (
								<Button
									variant="ghost"
									size="xs"
									disabled={takeBack.isPending}
									onClick={() =>
										takeBack.mutate({
											eventId: data.event.id,
											guestId: f.guestId,
										})
									}
								>
									Take back
								</Button>
							) : null}
						</li>
					))}
				</ul>
			) : null}
			{me.canInvite && me.invitesLeft > 0 ? (
				<form
					className="flex flex-wrap gap-2"
					onSubmit={(ev) => {
						ev.preventDefault();
						invite.mutate({ eventId: data.event.id, email });
					}}
				>
					<label htmlFor="friend-email" className="sr-only">
						Their email
					</label>
					<Input
						id="friend-email"
						type="email"
						required
						placeholder="Their email"
						value={email}
						onChange={(ev) => setEmail(ev.target.value)}
						className="min-w-0 flex-[1_1_200px]"
					/>
					<Button type="submit" variant="light" disabled={invite.isPending}>
						{invite.isPending ? "Inviting..." : "Invite"}
					</Button>
				</form>
			) : null}
			<p className="m-0 text-[13px] text-haze">
				{me.canInvite
					? me.invitesLeft > 0
						? `You can invite ${plural(me.invitesLeft, "more person", "more people")}. They get their own invitation and can bring their own plus-ones, but can't invite anyone else.`
						: `That's everyone you can invite to this one (${data.event.guestInviteLimit}).`
					: "The hosts aren't taking more guests right now."}
			</p>
		</section>
	);
}
