import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import PageTitle from "@/components/page-title";
import SectionKicker from "@/components/section-kicker";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/schedule")({
	component: SchedulePage,
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(context.orpc.games.list.queryOptions()),
});

type Game = Awaited<
	ReturnType<typeof orpc.games.list.call>
>["upcoming"][number];

function GameTable({ games, muted }: { games: Game[]; muted?: boolean }) {
	return (
		<div className="overflow-x-auto">
			<table
				className={`w-full min-w-[640px] border-collapse text-sm ${muted ? "text-neutral-700" : ""}`}
			>
				<thead>
					<tr>
						{["Date", "Start", "Venue", "In", "Permit"].map((h) => (
							<th
								key={h}
								className="border-divider border-b px-2 py-1.5 text-left font-medium text-[11px] text-ink/60 uppercase tracking-[0.08em]"
							>
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{games.map((g) => (
						<tr
							key={g.id}
							className="border-ink/8 border-b hover:bg-ink/4 [&>td]:px-2 [&>td]:py-2"
						>
							<td className="whitespace-nowrap font-heading font-semibold text-xl uppercase tracking-[0.02em]">
								{g.dateLabel}
							</td>
							<td className="tnum whitespace-nowrap">{g.timeLabel}</td>
							<td>
								{g.gym.name}
								{g.gym.address ? (
									<span className="block text-[13px] text-neutral-700">
										{g.gym.address}
									</span>
								) : null}
								{g.gym.notes ? (
									<span className="block text-[13px] text-neutral-700">
										{g.gym.notes}
									</span>
								) : null}
								{g.notes ? (
									<span className="block text-[13px] text-neutral-700">
										{g.notes}
									</span>
								) : null}
							</td>
							<td className="tnum">{g.inCount}</td>
							<td>
								{g.permit ? (
									<a
										href={`/api/permits/${g.permit.id}/file`}
										target="_blank"
										rel="noreferrer"
										className="inline-flex items-center border border-steel px-2.5 py-[3px] text-[11px] text-steel tracking-[0.02em] no-underline hover:bg-steel/10"
									>
										PDF · {g.permit.label}
									</a>
								) : (
									<span className="inline-flex items-center bg-neutral-100 px-2.5 py-[3px] text-[11px] text-neutral-800 tracking-[0.02em]">
										None yet
									</span>
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function SchedulePage() {
	const { data } = useQuery(orpc.games.list.queryOptions());
	const upcoming = data?.upcoming ?? [];
	const past = data?.past ?? [];

	return (
		<section className="pt-18 pb-15">
			<PageTitle
				line1="The schedule."
				line2="Only dates with a venue booked."
			/>
			<p className="mt-7 mb-10 max-w-[60ch] text-base leading-6">
				An event exists once the venue is booked. Where there is a permit on
				file, open it to show at the front desk.
			</p>
			<SectionKicker className="mb-5">05 · Booked</SectionKicker>
			{upcoming.length === 0 ? (
				<p className="text-[15px] text-neutral-700 leading-6">
					Nothing booked yet. Check back soon.
				</p>
			) : (
				<GameTable games={upcoming} />
			)}
			{past.length > 0 ? (
				<div className="mt-12">
					<SectionKicker className="mb-5">06 · Past</SectionKicker>
					<GameTable games={past} muted />
				</div>
			) : null}
		</section>
	);
}
