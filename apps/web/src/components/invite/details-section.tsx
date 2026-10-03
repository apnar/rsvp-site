import { cn } from "@rsvp-site/ui/lib/utils";

import type { Invite } from "./types";

/** A block of plain text, a blank line between paragraphs. */
function Paragraphs({ text }: { text: string }) {
	return text
		.split(/\n{2,}/)
		.filter((para) => para.trim())
		.map((para) => (
			<p key={para} className="m-0 whitespace-pre-line text-[17px] text-soft">
				{para}
			</p>
		));
}

/** "The details", and "Good to know" under it for what only guests see. */
export function DetailsSection({ event: e }: { event: Invite["event"] }) {
	if (!e.details && !e.extraDetails) return null;
	return (
		<section className="flex flex-col gap-3">
			<h2 className="m-0 text-[28px]">The details</h2>
			<Paragraphs text={e.details} />
			{e.extraDetails ? (
				<div
					className={cn(
						"flex flex-col gap-3",
						e.details && "mt-2 border-line border-t pt-5",
					)}
				>
					{e.details ? (
						<span className="kicker text-haze">Good to know</span>
					) : null}
					<Paragraphs text={e.extraDetails} />
				</div>
			) : null}
		</section>
	);
}
