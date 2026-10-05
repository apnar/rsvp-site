import { buttonVariants } from "@rsvp-site/ui/components/button";
import { Link } from "@tanstack/react-router";

import { DeleteEvent } from "@/components/event-editor/delete-event";
import { Container } from "@/components/page";

import type { Invite } from "./types";

/**
 * A host's way to the controls, in a strip above the invitation rather
 * than inside it, so that everything under it is the page exactly as a
 * guest has it.
 */
export function HostBar({ data }: { data: Invite }) {
	const e = data.event;
	const [kicker, line] =
		e.status === "canceled"
			? ["Canceled", "This one's off. Guests see it like this."]
			: e.status === "draft"
				? ["Draft", "Only hosts can see this. Guests will see it like this."]
				: ["Host view", "This is what your guests see."];
	return (
		<div className="border-line border-b bg-panel">
			<Container className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3">
				<p className="m-0 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-[15px]">
					<span className="kicker text-lime-ink">{kicker}</span>
					<span className="text-soft">{line}</span>
				</p>
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
			</Container>
		</div>
	);
}
