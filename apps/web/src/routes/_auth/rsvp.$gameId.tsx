import { Blueprint } from "@rsvp-site/ui/components/blueprint";
import { Button, buttonVariants } from "@rsvp-site/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { GameFacts } from "@/components/game-facts";
import PageTitle from "@/components/page-title";
import { ResponsePicker } from "@/components/response-picker";
import { RsvpStatus } from "@/components/rsvp-status";
import SectionKicker from "@/components/section-kicker";
import { headcountOptions, useRsvps } from "@/hooks/use-rsvps";
import type { RsvpAnswer } from "@/lib/rsvp";

/**
 * Where every button in every cycle email lands.
 *
 * It reads. It does not write. Mail clients fetch link targets on their own,
 * and the last time something on this site acted on a bare GET it quietly
 * unsubscribed people who had never clicked anything -- see
 * `apps/web/src/server/unsubscribe.ts`. So the link carries the answer, the
 * page shows it, and a human taps once to record it. The mutation is a POST
 * that only an onClick fires; nothing in `beforeLoad`, the loader or render
 * touches the database.
 */
export const Route = createFileRoute("/_auth/rsvp/$gameId")({
	// `.catch` rather than a hard failure: mail clients rewrite URLs, and a
	// mangled answer should show the picker, not an error page.
	validateSearch: z.object({
		a: z.enum(["in", "maybe", "out"]).optional().catch(undefined),
	}),
	loaderDeps: ({ search }) => ({ a: search.a }),
	loader: ({ context, params }) =>
		context.queryClient.ensureQueryData(headcountOptions(params.gameId)),
	head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
	component: RsvpConfirmPage,
});

const HEADING: Record<RsvpAnswer, string> = {
	in: "In. Recorded.",
	maybe: "Maybe. Recorded, sort of.",
	out: "Out. Recorded.",
};

/**
 * The button says "confirm", not the answer again. When it read "Yes, I'm in"
 * under a highlighted "I'm in" cell in the same steel, people took it for a
 * label of what they had already done and left the page with nothing
 * recorded.
 */
const CONFIRM: Record<RsvpAnswer, string> = {
	in: "Confirm: I'm in",
	maybe: "Confirm: maybe",
	out: "Confirm: I'm out",
};

function RsvpConfirmPage() {
	const { gameId } = Route.useParams();
	const { a } = Route.useSearch();
	const { data } = useQuery(headcountOptions(gameId));
	const { headcount, isPending, respond, comeBack, backPending } =
		useRsvps(gameId);
	const [picked, setPicked] = useState<RsvpAnswer | null>(a ?? null);
	const [done, setDone] = useState<RsvpAnswer | null>(null);

	const state = headcount ?? data ?? null;

	if (!state) {
		return (
			<section className="pt-18 pb-15">
				<PageTitle
					line1="That event is gone."
					line2="Somebody moved it, or it was never there."
				/>
				<p className="mt-7 max-w-[60ch] text-base leading-6">
					Nothing was recorded. The schedule knows what is actually booked.
				</p>
				<Link
					to="/schedule"
					className={buttonVariants({ className: "mt-6 no-underline" })}
				>
					The schedule
				</Link>
			</section>
		);
	}

	const { game, viewer, me, rsvps } = state;
	const away = viewer?.status === "suspended";
	const locked = game.status === "canceled" || Boolean(game.decidedAt);
	const mine = me ? (rsvps.find((r) => r.id === me)?.response ?? null) : null;
	const committed = done ?? null;

	return (
		<section className="pt-18 pb-15">
			<PageTitle
				line1={game.dateLabel}
				line2={
					committed
						? HEADING[committed]
						: locked
							? "The count is closed."
							: "Pick, then tap confirm. That's the sheet."
				}
			/>

			<div className="mt-10 grid grid-cols-1 items-start gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
				<div>
					<GameFacts game={game} />

					{locked ? (
						<p className="max-w-[52ch] text-[15px] text-neutral-700 leading-6">
							Called at 7:31. Nothing you tap now changes it.
						</p>
					) : away ? (
						<Blueprint className="border-amber-300 bg-amber-50 p-4">
							<p className="m-0 text-[13px] text-amber-900 leading-5">
								You're taking a break, so you're not on the sheet. Come back
								first and the answer will stick.
							</p>
							<Button
								className="mt-3"
								size="sm"
								disabled={backPending}
								onClick={() => comeBack()}
							>
								I'm back
							</Button>
						</Blueprint>
					) : committed ? (
						<div className="flex flex-wrap gap-2.5">
							<Link
								to="/"
								hash="rsvp"
								className={buttonVariants({ className: "no-underline" })}
							>
								The whole sheet
							</Link>
							<Button variant="ghost" onClick={() => setDone(null)}>
								Change it
							</Button>
						</div>
					) : (
						<>
							<ResponsePicker
								name="confirm-answer"
								legend={
									mine ? `1 · You said ${mine}. Change it?` : "1 · Your answer"
								}
								value={picked}
								disabled={isPending}
								onPick={setPicked}
								pending
							/>
							<p className="kicker mt-6 mb-2 text-steel-700">
								2 · Tap to record it
							</p>
							<Button
								size="lg"
								className="w-full sm:w-auto"
								disabled={isPending || !picked}
								onClick={async () => {
									if (!picked) return;
									try {
										await respond(picked);
										setDone(picked);
									} catch {
										// The toast already said so.
									}
								}}
							>
								{picked ? CONFIRM[picked] : "Pick one first"}
								<ArrowRight />
							</Button>
							<p className="mt-3 max-w-[52ch] text-[13px] text-neutral-700 leading-5">
								Nothing is on the sheet until you tap that. Mail apps open links
								on their own, and without this step one of them could answer for
								you. So the tap is yours.
							</p>
						</>
					)}
				</div>

				<div>
					<SectionKicker className="mb-5">07 · Where it stands</SectionKicker>
					<RsvpStatus headcount={state} />
				</div>
			</div>
		</section>
	);
}
