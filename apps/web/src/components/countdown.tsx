import { useClock } from "@/hooks/use-countdown";

/**
 * The tile row under the invite hero: time to go, then the counts. The
 * clock is seeded from the payload's `now`, so the server render and the
 * hydrated page say the same thing.
 */
export function CountdownTiles({
	nowIso,
	startsAtIso,
	tiles,
}: {
	nowIso: string;
	startsAtIso: string | null;
	tiles: { value: string | number; label: string; tone?: "lime" | "pink" }[];
}) {
	const now = useClock(nowIso, startsAtIso);
	const remaining = startsAtIso ? Date.parse(startsAtIso) - now : null;
	const time =
		remaining === null
			? null
			: remaining <= 0
				? { value: "Now", label: "party on" }
				: remaining >= 86_400_000
					? {
							value: String(Math.floor(remaining / 86_400_000)),
							label: Math.floor(remaining / 86_400_000) === 1 ? "day" : "days",
						}
					: remaining >= 3_600_000
						? {
								value: String(Math.floor(remaining / 3_600_000)),
								label:
									Math.floor(remaining / 3_600_000) === 1 ? "hour" : "hours",
							}
						: {
								value: String(Math.max(1, Math.floor(remaining / 60_000))),
								label: "minutes",
							};
	const all = [
		...(time ? [{ ...time, tone: "lime" as const }] : []),
		...tiles,
	].slice(0, 4);
	return (
		<section
			className="grid max-w-[640px] gap-[clamp(6px,1.5vw,16px)]"
			style={{ gridTemplateColumns: `repeat(${all.length}, minmax(0, 1fr))` }}
		>
			{all.map((t) => (
				<div
					key={t.label}
					className="rounded-[18px] bg-panel px-2 py-[clamp(10px,2vw,18px)] text-center"
				>
					<div
						className={`numeral text-[clamp(28px,5vw,52px)] ${t.tone === "lime" ? "text-lime" : t.tone === "pink" ? "text-pink" : ""}`}
					>
						{t.value}
					</div>
					<div className="mt-1.5 text-[12px] text-haze uppercase tracking-[0.1em]">
						{t.label}
					</div>
				</div>
			))}
		</section>
	);
}
