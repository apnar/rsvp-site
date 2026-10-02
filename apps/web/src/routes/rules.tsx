import { Blueprint } from "@rsvp-site/ui/components/blueprint";
import { createFileRoute } from "@tanstack/react-router";

import PageTitle from "@/components/page-title";
import SectionKicker from "@/components/section-kicker";
import { rules } from "@/content/run";

export const Route = createFileRoute("/rules")({
	component: RulesPage,
});

function RulesPage() {
	return (
		<section className="pt-18 pb-15">
			<PageTitle
				line1="House rules."
				line2="Argue with them at your own risk."
			/>
			<p className="mt-7 mb-10 max-w-[60ch] text-base leading-6">
				A short list, because good guests mostly know them already. They apply
				to every event on the schedule, and the host has the final word on all
				of them.
			</p>
			<SectionKicker>04 · Code of conduct</SectionKicker>
			<div className="grid grid-cols-1 gap-[clamp(24px,3vw,48px)] p-2 md:grid-cols-3">
				{rules.map((rule, i) => (
					<Blueprint key={rule.title} className="p-6">
						<span className="kicker tnum mb-3 block text-steel-700">
							{String(i + 1).padStart(2, "0")}
						</span>
						<h2 className="font-heading text-[22px] uppercase leading-6 tracking-[0.02em]">
							{rule.title}
						</h2>
						<p className="mt-3 text-[15px] text-neutral-700 leading-6">
							{rule.body}
						</p>
					</Blueprint>
				))}
			</div>
		</section>
	);
}
