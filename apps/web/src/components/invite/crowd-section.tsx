import { ResponseBar, ResponseCounts } from "@/components/response-bar";
import { crowdLine, sentence } from "@/lib/format";
import type { Invite } from "./types";

/** Who is coming: the bar, the counts, and names where the hosts show them. */
export function CrowdSection({
	totals,
	crowd,
	answers,
}: {
	totals: Invite["totals"];
	crowd: Invite["crowd"];
	answers: Invite["answers"];
}) {
	return (
		<section className="flex flex-col gap-3.5">
			<h2 className="m-0 text-[28px]">The crowd</h2>
			<ResponseBar
				totals={totals}
				words={answers.words}
				className="h-3.5 bg-panel"
			/>
			<ResponseCounts
				totals={totals}
				answers={answers}
				alwaysShowOut
				className="gap-x-[18px]"
			/>
			{crowd.yes.length > 0 ? (
				<span className="text-[15px] text-soft">
					{sentence(crowdLine(crowd.yes))}
					{crowd.maybe.length > 0
						? ` ${answers.words.maybe.pick}: ${sentence(crowdLine(crowd.maybe, 3))}`
						: ""}
				</span>
			) : null}
		</section>
	);
}
