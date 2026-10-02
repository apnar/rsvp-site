import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import PageTitle from "@/components/page-title";
import SectionKicker from "@/components/section-kicker";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/roster")({
	component: RosterPage,
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(
			context.orpc.people.roster.queryOptions(),
		),
});

const thClass =
	"border-divider border-b px-2 py-1.5 text-left font-medium text-[11px] text-ink/60 uppercase tracking-[0.08em]";

const chip = (tone: "steel" | "neutral" | "warn") =>
	`inline-flex items-center px-2.5 py-[3px] text-[11px] tracking-[0.02em] ${
		tone === "steel"
			? "bg-steel-100 text-steel-800"
			: tone === "warn"
				? "bg-amber-100 text-amber-900"
				: "bg-neutral-100 text-neutral-800"
	}`;

/**
 * Everybody on the list, ordered by events actually attended. This used to be
 * eight invented names with scouting reports; it is the `user` table now, so
 * the only things it can say about somebody are things the app actually knows.
 */
function RosterPage() {
	const { data } = useQuery(orpc.people.roster.queryOptions());
	const people = data ?? [];
	const played = people.filter((p) => p.games > 0).length;

	return (
		<section className="pt-18 pb-15">
			<PageTitle line1="The guest list." line2="Ranked by attendance." />
			<p className="mt-7 mb-10 max-w-[60ch] text-base leading-6">
				Everyone on the list, in order of events turned up for. An event counts
				when you put your own name in and left it in. Plus-ones belong to
				nobody, so they count for nobody.
			</p>
			<SectionKicker className="mb-5">03 · Who's who</SectionKicker>
			{people.length === 0 ? (
				<p className="text-[15px] text-neutral-700 leading-6">
					Nobody on the list yet. That includes you, somehow.
				</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[640px] border-collapse text-sm">
						<thead>
							<tr>
								{["No.", "Name", "Since", "Events", "Last in", "Status"].map(
									(h) => (
										<th key={h} className={thClass}>
											{h}
										</th>
									),
								)}
							</tr>
						</thead>
						<tbody>
							{people.map((p) => (
								<tr
									key={p.id}
									className={`border-ink/8 border-b hover:bg-ink/4 [&>td]:px-2 [&>td]:py-1.5 ${
										p.away ? "text-neutral-600" : ""
									}`}
								>
									<td className="kicker tnum text-steel-700">{p.num}</td>
									<td className="whitespace-nowrap font-heading font-semibold text-xl uppercase tracking-[0.02em]">
										{p.name}
										{p.isYou ? (
											<span className="kicker ml-2 align-middle text-steel-700">
												You
											</span>
										) : null}
									</td>
									<td className="tnum">{p.since}</td>
									<td className="tnum">{p.games}</td>
									<td className="whitespace-nowrap text-neutral-700">
										{p.lastPlayed ?? "—"}
									</td>
									<td>
										{/* "Guest" only says "not on a break", which Host
										    already implies. Two chips means somebody who runs the
										    thing is also sitting one out. */}
										<span className="flex flex-wrap gap-1.5">
											{p.isAdmin ? (
												<span className={chip("steel")}>Host</span>
											) : null}
											{p.away ? (
												<span className={chip("warn")}>On a break</span>
											) : p.isAdmin ? null : (
												<span className={chip("neutral")}>Guest</span>
											)}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			<p className="mt-4 text-[13px] text-neutral-700 leading-6">
				{played === 0
					? "Nobody has an event on the board yet. The first one fixes that."
					: "Want a higher number? There is one way, and it is showing up."}{" "}
				Getting on the list at all is the host's call.
			</p>
		</section>
	);
}
