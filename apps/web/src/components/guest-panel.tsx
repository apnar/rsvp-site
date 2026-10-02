import type { Headcount } from "@rsvp-site/api/routers/rsvp";
import { Blueprint } from "@rsvp-site/ui/components/blueprint";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { useState } from "react";

import { useClock } from "@/hooks/use-countdown";
import { guestLine } from "@/lib/rsvp";

/**
 * Plus-ones: who you have brought tonight, and how keen the event is on more.
 *
 * The box is open whenever the count is; only the line above it changes, and
 * `guestLine` in lib/rsvp.ts says why. Nobody is stopped from putting a name
 * in early -- the night you already promised somebody is not the night to
 * argue with a form. Taking a guest back off is likewise never blocked: a
 * guest has no inbox and no buttons, so whoever vouched for them is the only
 * one who can say they are not coming.
 */
export function GuestPanel({
	headcount,
	locked,
	isPending,
	add,
	removeGuest,
}: {
	headcount: Headcount;
	locked: boolean;
	isPending: boolean;
	add: (name: string) => Promise<unknown>;
	removeGuest: (rowId: string) => void;
}) {
	const { counts, confirmAt, playAt, capacity, game, rsvps } = headcount;
	const [draft, setDraft] = useState("");

	const lastCallAt =
		game.cycle.stages.find((s) => s.key === "lastCall")?.at ?? null;
	// Seeded from the payload, ticking in an effect, so the box opens by itself
	// at six without a reload and without a hydration mismatch.
	const now = useClock(headcount.now, lastCallAt);
	const lastCallPassed = lastCallAt ? now >= Date.parse(lastCallAt) : false;

	const line = guestLine(
		counts,
		{ confirmAt, playAt, capacity },
		lastCallPassed,
		locked,
	);
	const mine = rsvps.filter((r) => r.guest && r.mine);

	return (
		<Blueprint className="mt-6 max-w-[480px] p-5">
			<span className="kicker block text-steel-700">Plus-ones</span>

			{mine.length > 0 ? (
				<ul className="mt-3 mb-1 list-none border-divider border-t p-0">
					{mine.map((r) => (
						<li
							key={r.id}
							className="flex items-center justify-between gap-3 border-ink/8 border-b py-2"
						>
							<span className="font-heading font-semibold text-lg uppercase leading-6 tracking-[0.02em]">
								{r.name}
							</span>
							<Button
								size="sm"
								variant="ghost"
								disabled={isPending || locked}
								onClick={() => removeGuest(r.id)}
							>
								Remove
							</Button>
						</li>
					))}
				</ul>
			) : null}

			<p className="mt-3 mb-0 text-[13px] text-neutral-700 leading-5">{line}</p>

			{locked ? null : (
				<>
					<form
						className="mt-4 flex gap-2.5"
						onSubmit={async (e) => {
							e.preventDefault();
							if (!draft.trim()) return;
							try {
								await add(draft);
								setDraft("");
							} catch {
								// The toast already said so.
							}
						}}
					>
						<Input
							aria-label="Add a plus-one"
							placeholder="Add a plus-one"
							maxLength={40}
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
						/>
						<Button type="submit" variant="outline" disabled={isPending}>
							Add
						</Button>
					</form>

					{headcount.guestSuggestions.length > 0 ? (
						<div className="mt-3">
							<span className="kicker block text-[11px] text-steel-700">
								Brought before
							</span>
							<div className="mt-2 flex flex-wrap gap-2">
								{headcount.guestSuggestions.map((name) => (
									<Button
										key={name}
										size="sm"
										variant="outline"
										disabled={isPending}
										onClick={() => add(name).catch(() => {})}
									>
										{name}
									</Button>
								))}
							</div>
						</div>
					) : null}

					<p className="mt-4 mb-0 text-[13px] text-neutral-700 leading-5">
						You answer for anyone you drag along, and they hear nothing from us
						-- no emails, no cancellation. That part is on you.
					</p>
				</>
			)}
		</Blueprint>
	);
}
