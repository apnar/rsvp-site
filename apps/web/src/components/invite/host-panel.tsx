import { buttonVariants } from "@rsvp-site/ui/components/button";
import { Link } from "@tanstack/react-router";

import { DeleteEvent } from "@/components/event-editor/delete-event";

import type { Invite } from "./types";

/**
 * How a host gets to the controls: in place of the form, or above it when
 * the host is on the guest list too.
 */
export function HostPanel({ data }: { data: Invite }) {
	const e = data.event;
	return (
		<section className="flex flex-col gap-4 rounded-[28px] border border-line bg-panel p-[clamp(20px,3vw,32px)]">
			<span className="kicker text-lime-ink">
				{e.status === "canceled" ? "Canceled" : "Host view"}
			</span>
			<h2 className="m-0 text-[30px]">
				{e.status === "canceled"
					? "This one's off."
					: "This is what your guests see."}
			</h2>
			{data.isHost ? (
				<div className="flex flex-wrap gap-2">
					<Link
						to="/e/$eventId/guests"
						params={{ eventId: e.id }}
						className={buttonVariants({ variant: "light" })}
					>
						Guest list
					</Link>
					{e.status === "canceled" ? (
						data.canDelete ? (
							<DeleteEvent
								eventId={e.id}
								status={e.status}
								expectingGuests={false}
								stillComing={0}
							/>
						) : null
					) : (
						<Link
							to="/e/$eventId/edit"
							params={{ eventId: e.id }}
							className={buttonVariants({ variant: "outline" })}
						>
							Edit
						</Link>
					)}
				</div>
			) : (
				<p className="m-0 text-soft">Nothing to answer. Sorry to miss you.</p>
			)}
		</section>
	);
}
