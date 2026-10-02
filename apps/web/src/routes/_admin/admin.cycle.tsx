import { CYCLE_NUMBERS, STAGES } from "@rsvp-site/api/cycle";
import { Blueprint } from "@rsvp-site/ui/components/blueprint";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import SectionKicker from "@/components/section-kicker";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_admin/admin/cycle")({
	component: AdminCyclePage,
});

const RUN_TZ = "America/New_York";

function when(value: string | null): string {
	if (!value) return "";
	return new Date(value).toLocaleString("en-US", {
		timeZone: RUN_TZ,
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

const chip = (tone: "steel" | "neutral" | "warn") =>
	`inline-flex items-center px-2.5 py-[3px] text-[11px] tracking-[0.02em] ${
		tone === "steel"
			? "bg-steel-100 text-steel-800"
			: tone === "warn"
				? "bg-amber-100 text-amber-900"
				: "bg-neutral-100 text-neutral-800"
	}`;

/**
 * What the robot does, rendered from the same constants the robot reads. The
 * whole point of the page is that it cannot describe a schedule the code is
 * not keeping -- so nothing here is a hand-typed time or threshold.
 */
function AdminCyclePage() {
	const cycle = useQuery(orpc.mail.cycle.queryOptions());
	const games = cycle.data ?? [];

	return (
		<section>
			<p className="mb-10 max-w-[60ch] text-base leading-6">
				Nobody sends these by hand any more. The cron wakes up every half hour,
				reads the clock at the venue, and does exactly what is written below.
				Change the numbers in one file and this page changes with them, which is
				the only way a page like this stays true.
			</p>

			<SectionKicker className="mb-5">06 · The cycle</SectionKicker>
			<Blueprint className="mb-12">
				<div className="kicker grid grid-cols-1 border-divider border-b md:grid-cols-[72px_180px_1fr_1.2fr]">
					<span className="px-4 py-3 text-steel-700">Stage</span>
					<span className="border-divider px-4 py-3 md:border-l">When</span>
					<span className="border-divider px-4 py-3 md:border-l">
						What goes out
					</span>
					<span className="border-divider px-4 py-3 md:border-l">
						Who hears it
					</span>
				</div>
				{STAGES.map((stage) => (
					<div
						key={stage.key}
						className="grid grid-cols-1 border-divider border-b last:border-b-0 md:grid-cols-[72px_180px_1fr_1.2fr]"
					>
						<span className="kicker tnum px-4 py-4 text-steel-700">
							{stage.num}
						</span>
						<span className="border-divider px-4 py-4 font-heading font-semibold text-[19px] leading-6 md:border-l">
							{stage.when}
						</span>
						<span className="border-divider px-4 py-4 text-[15px] leading-6 md:border-l">
							<span className="block font-heading font-semibold text-lg uppercase tracking-[0.02em]">
								{stage.title}
							</span>
							{stage.says}
						</span>
						<span className="border-divider px-4 py-4 text-[15px] text-neutral-700 leading-6 md:border-l">
							{stage.who}
							<span className="mt-1 block text-[13px]">{stage.aside}</span>
						</span>
					</div>
				))}
				<p className="m-0 px-4 py-3 text-[13px] text-neutral-700 leading-5">
					Times are the venue's clock. Daylight saving is handled on the server,
					where it belongs. Two cycle emails about the same event never land
					within ninety minutes of each other — except the verdict, which is the
					one nobody may miss.
				</p>
			</Blueprint>

			<SectionKicker className="mb-5">07 · The numbers</SectionKicker>
			<div className="mb-12 grid grid-cols-1 gap-[clamp(24px,3vw,48px)] p-2 md:grid-cols-3">
				{CYCLE_NUMBERS.map((n) => (
					<Blueprint key={n.label} className="p-6">
						<span className="tnum block font-heading font-semibold text-[56px] text-steel-700 leading-none">
							{n.value}
						</span>
						<h2 className="mt-2 font-heading text-[22px] uppercase leading-6 tracking-[0.02em]">
							{n.label}
						</h2>
						<p className="mt-3 text-[15px] text-neutral-700 leading-6">
							{n.body}
						</p>
					</Blueprint>
				))}
			</div>
			<p className="mb-12 max-w-[60ch] text-[15px] text-neutral-700 leading-6">
				A maybe counts toward nothing. It is a mailing list with a conscience —
				it decides who gets the six o'clock last call, and that is the whole
				job.
			</p>

			<SectionKicker className="mb-5">08 · Where each event is</SectionKicker>
			{games.length === 0 ? (
				<p className="text-[15px] text-neutral-700 leading-6">
					Nothing booked. The cron has the night off.
				</p>
			) : (
				<ul className="m-0 list-none space-y-4 p-0">
					{games.map((g) => (
						<li key={g.gameId}>
							<Blueprint className="p-4">
								<div className="flex flex-wrap items-baseline justify-between gap-3">
									<span className="font-heading font-semibold text-xl uppercase tracking-[0.02em]">
										{g.dateLabel}
									</span>
									<span className="text-[13px] text-neutral-700">
										{g.timeLabel} · {g.gym} · {g.counts.in} in, {g.counts.maybe}{" "}
										maybe, {g.counts.silent} silent
									</span>
									<span
										className={chip(
											g.status === "confirmed"
												? "steel"
												: g.status === "canceled"
													? "warn"
													: "neutral",
										)}
									>
										{g.status === "confirmed"
											? "On"
											: g.status === "canceled"
												? "Off"
												: "Not called"}
									</span>
								</div>
								<div className="mt-3 flex flex-wrap gap-2 border-divider border-t pt-3">
									{g.stages.map((stage) => (
										<span
											key={stage.key}
											className={chip(
												stage.failed > 0
													? "warn"
													: stage.doneAt
														? "steel"
														: "neutral",
											)}
										>
											{stage.num} {stage.title}
											{stage.sentAt
												? ` · ${when(stage.sentAt)}`
												: stage.doneAt
													? " · skipped"
													: " · waiting"}
											{stage.failed > 0 ? ` · ${stage.failed} failed` : ""}
										</span>
									))}
								</div>
							</Blueprint>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
