import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { EventEditor } from "@/components/event-editor";
import { Page, PageHead } from "@/components/page";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/e/$eventId/edit")({
	loader: ({ context, params }) =>
		context.queryClient.ensureQueryData(
			orpc.events.get.queryOptions({ input: { eventId: params.eventId } }),
		),
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData
					? `Edit · ${loaderData.event.title} · Botch RSVP`
					: "Botch RSVP",
			},
		],
	}),
	component: EditEvent,
});

const STATUS = {
	draft: "Draft · not sent",
	published: "Sent",
	canceled: "Canceled",
} as const;

function EditEvent() {
	const { eventId } = Route.useParams();
	const { data } = useSuspenseQuery(
		orpc.events.get.queryOptions({ input: { eventId } }),
	);
	return (
		<Page className="gap-7">
			<Link
				to="/events"
				className="self-start font-bold text-[14px] no-underline"
			>
				← All events
			</Link>
			<PageHead kicker={STATUS[data.event.status]} title={data.event.title} />
			<EventEditor key={data.event.updatedAt.toString()} loaded={data} />
		</Page>
	);
}
