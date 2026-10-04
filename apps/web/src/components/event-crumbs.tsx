import { Link } from "@tanstack/react-router";

/**
 * The way back from an event's own pages (the guest list, the editor):
 * to every event, and to this one's invitation, which a host otherwise
 * had no link back to from here.
 */
export function EventCrumbs({
	eventId,
	title,
	here,
}: {
	eventId: string;
	title: string;
	/** The page this is, shown last and not a link. */
	here: string;
}) {
	return (
		<nav aria-label="Breadcrumb" className="self-stretch">
			<ol className="m-0 flex min-w-0 list-none flex-wrap items-center gap-x-2 gap-y-1 p-0 font-bold text-[14px]">
				<li>
					<Link to="/events" className="no-underline">
						← All events
					</Link>
				</li>
				<li aria-hidden className="text-haze">
					/
				</li>
				<li className="min-w-0 max-w-full">
					<Link
						to="/e/$eventId"
						params={{ eventId }}
						// The router calls a link to any parent of this page
						// active and marks it the current page; it isn't.
						activeOptions={{ exact: true }}
						className="block truncate no-underline"
					>
						{title}
					</Link>
				</li>
				<li aria-hidden className="text-haze">
					/
				</li>
				<li aria-current="page" className="text-soft">
					{here}
				</li>
			</ol>
		</nav>
	);
}

/**
 * An event's title as a page heading that opens its invitation: ink, not
 * link-lime, so the heading still reads as one, with an underline on hover
 * and focus to say it goes somewhere.
 */
export function EventTitleLink({
	eventId,
	title,
}: {
	eventId: string;
	title: string;
}) {
	return (
		<Link
			to="/e/$eventId"
			params={{ eventId }}
			activeOptions={{ exact: true }}
			title="Open the invitation"
			className="text-ink no-underline decoration-[0.06em] decoration-lime hover:text-ink hover:underline focus-visible:underline"
		>
			{title}
		</Link>
	);
}
