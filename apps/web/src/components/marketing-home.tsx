import { Blueprint } from "@rsvp-site/ui/components/blueprint";
import { buttonVariants } from "@rsvp-site/ui/components/button";
import { Link } from "@tanstack/react-router";

import PageTitle from "@/components/page-title";
import SectionKicker from "@/components/section-kicker";
import { conditions } from "@/content/run";

/**
 * What a stranger sees. The pitch and the rules, but not the venue, not the
 * start time, not who is coming. Those are for people on the list.
 */

/** Venue and start time stay off this page, so those two rows get rewritten. */
const publicConditions = [
	conditions.find((c) => c.prop === "Date"),
	{
		num: "02",
		prop: "Where",
		val: "On the invitation",
		rem: "The address goes to guests. Guests know where.",
	},
	conditions.find((c) => c.prop === "RSVP"),
	conditions.find((c) => c.prop === "Plus-ones"),
]
	.filter(Boolean)
	.map((c, i) => ({
		...(c as { num: string; prop: string; val: string; rem: string }),
		// The full sheet numbers start 02 and venue 03. Both are hidden from
		// strangers, so renumber what is left instead of leaving a gap.
		num: String(i + 1).padStart(2, "0"),
	}));

const howToGetIn = [
	{
		num: "01",
		title: "It is invite only",
		body: "One host, one guest list, and a sheet that fills up. Nobody signs themselves up.",
	},
	{
		num: "02",
		title: "Know somebody who's going",
		body: "Ask them to mention you to the host. That is the whole application process.",
	},
	{
		num: "03",
		title: "Or just ask the host",
		body: "The host keeps the list and has the only vote that counts. Worst case the answer is that the event is full.",
	},
	{
		num: "04",
		title: "Already in?",
		body: "Every link in your email signs you in. Check your inbox, or use a password.",
	},
];

export default function MarketingHome() {
	return (
		<>
			<section className="pt-18 pb-12">
				<PageTitle
					size="hero"
					line1="You're invited."
					line2="If you're on the list."
				/>
				<p className="mt-7 max-w-[60ch] text-base leading-6">
					Invitations and RSVPs for the host's events. Guests get one email
					asking in, out or maybe, a reminder if they forget, and a final word
					on whether it is going ahead. No app to install, no password needed.
				</p>
				<div className="mt-6 flex flex-wrap gap-2.5">
					<Link
						to="/rules"
						className={buttonVariants({ className: "no-underline" })}
					>
						Read the rules
					</Link>
					<Link
						to="/login"
						className={buttonVariants({
							variant: "ghost",
							className: "no-underline",
						})}
					>
						Sign in
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
					{publicConditions.map((c) => (
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
						The start time and the address go to people on the list. Not to you.
						Yet.
					</p>
				</Blueprint>
			</section>

			<section className="py-12 pb-15">
				<SectionKicker className="mb-6">02 · How to get in</SectionKicker>
				<Blueprint className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
					{howToGetIn.map((step) => (
						<div
							key={step.num}
							// Two up on tablets, four across on desktop: the dividers
							// follow, so the last cell in a row never grows one.
							className="border-ink/8 border-b p-6 md:border-b-0 lg:not-last:border-r md:[&:nth-child(-n+2)]:border-b lg:[&:nth-child(-n+2)]:border-b-0 md:[&:nth-child(odd)]:border-r"
						>
							<span className="kicker tnum text-steel-700">{step.num}</span>
							<h2 className="mt-2 font-heading text-[22px] uppercase leading-7 tracking-[0.02em]">
								{step.title}
							</h2>
							<p className="mt-2 text-[15px] text-neutral-700 leading-6">
								{step.body}
							</p>
						</div>
					))}
				</Blueprint>
			</section>
		</>
	);
}
