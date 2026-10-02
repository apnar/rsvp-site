import type { Headcount } from "@rsvp-site/api/routers/rsvp";
import { buttonVariants } from "@rsvp-site/ui/components/button";

/**
 * Where and when, plus how to get in the door. Shown on the board and on the
 * page a cycle email lands on -- somebody who just tapped "I'm in" from their
 * driveway wants the address more than anything else on the screen.
 */
export function GameFacts({ game }: { game: Headcount["game"] }) {
	return (
		<>
			<div className="mb-8 flex flex-wrap items-center gap-x-8 gap-y-3">
				<span className="font-heading font-semibold text-[32px] uppercase leading-9 tracking-[0.02em]">
					{game.dateLabel}
				</span>
				<span className="font-heading font-semibold text-[22px] leading-6 tracking-[0.02em]">
					{game.timeLabel}
				</span>
				<span className="text-[15px] text-neutral-700 leading-6">
					{game.gym.name}
				</span>
				{game.permit ? (
					<a
						href={`/api/permits/${game.permit.id}/file`}
						target="_blank"
						rel="noreferrer"
						className={buttonVariants({
							variant: "outline",
							size: "sm",
							className: "no-underline",
						})}
					>
						Permit (PDF)
					</a>
				) : (
					<span className="kicker text-neutral-600">No permit attached</span>
				)}
			</div>
			{game.gym.address || game.gym.notes || game.notes ? (
				<div className="-mt-4 mb-8 max-w-[60ch] space-y-1 text-[15px] text-neutral-700 leading-6">
					{game.gym.address ? (
						<p className="text-ink">{game.gym.address}</p>
					) : null}
					{/* How to get in, kept on the venue so it is right every time. */}
					{game.gym.notes ? <p>{game.gym.notes}</p> : null}
					{game.notes ? <p>{game.notes}</p> : null}
				</div>
			) : null}
		</>
	);
}
