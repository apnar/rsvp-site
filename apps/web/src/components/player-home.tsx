import { Blueprint } from "@rsvp-site/ui/components/blueprint";
import { Button, buttonVariants } from "@rsvp-site/ui/components/button";
import { Link } from "@tanstack/react-router";

import GymMoneyNotice from "@/components/gym-money-notice";
import PageTitle from "@/components/page-title";
import RsvpBoard from "@/components/rsvp-board";
import { conditions } from "@/content/run";

/** What a guest sees: the whole thing, headcount included. */
export default function PlayerHome() {
	return (
		<>
			<section className="pt-18 pb-12">
				<PageTitle
					size="hero"
					line1="You're invited."
					line2="Say if you're coming."
				/>
				<p className="mt-7 max-w-[60ch] text-base leading-6">
					The next event, who is in so far, and one button to add your name.
					Answer from here or from the email; either way the host gets an honest
					count.
				</p>
				<div className="mt-6 flex flex-wrap gap-2.5">
					<Button
						onClick={() =>
							document
								.getElementById("rsvp")
								?.scrollIntoView({ behavior: "smooth", block: "start" })
						}
					>
						Put my name in
					</Button>
					<Link
						to="/rules"
						className={buttonVariants({
							variant: "ghost",
							className: "no-underline",
						})}
					>
						Read the rules first
					</Link>
				</div>
			</section>

			<section className="pt-6 pb-12">
				<Blueprint>
					<header className="kicker flex flex-wrap border-divider border-b leading-6">
						<span className="min-w-[16ch] flex-1 px-6 py-3">
							Standing event conditions
						</span>
						<span className="whitespace-nowrap border-divider border-l px-6 py-3 text-neutral-700">
							Every event
						</span>
						<span className="whitespace-nowrap border-divider border-l px-6 py-3 text-neutral-700">
							Sheet 01
						</span>
					</header>
					{conditions.map((c) => (
						<div
							key={c.num}
							className="grid grid-cols-1 items-baseline gap-x-6 border-ink/8 border-b px-6 py-3 md:grid-cols-[72px_1fr_1fr_1.4fr]"
						>
							<span className="kicker tnum text-steel-700">{c.num}</span>
							<span className="text-[15px] leading-6">{c.prop}</span>
							<span className="font-heading font-semibold text-[22px] leading-6 tracking-[0.02em]">
								{c.val}
							</span>
							<span className="hidden text-[15px] text-neutral-700 leading-6 md:block">
								{c.rem}
							</span>
						</div>
					))}
					<p className="m-0 px-6 py-3 text-[13px] text-neutral-700 leading-6">
						Conditions hold unless the invitation says otherwise.
					</p>
				</Blueprint>
			</section>

			<GymMoneyNotice />
			<RsvpBoard />
		</>
	);
}
