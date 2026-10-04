import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { EventCrumbs, EventTitleLink } from "@/components/event-crumbs";
import { EventEditor } from "@/components/event-editor";
import { Page, PageHead } from "@/components/page";
import { pageTitle } from "@/content/site";
import { orNotFound } from "@/lib/not-found";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/e/$eventId/edit")({
	loader: async ({ context, params }) => {
		// The editor's pickers read the address book. prefetchQuery never
		// throws, so a failure there leaves the editor to ask again instead of
		// failing the page.
		const [loaded] = await Promise.all([
			orNotFound(
				context.queryClient.ensureQueryData(eventQuery(params.eventId)),
			),
			context.queryClient.prefetchQuery(orpc.contacts.book.queryOptions()),
		]);
		return loaded;
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: pageTitle(loaderData && "Edit", loaderData?.event.title),
			},
		],
	}),
	component: EditEvent,
});

const eventQuery = (eventId: string) =>
	orpc.events.get.queryOptions({ input: { eventId } });

const STATUS = {
	draft: "Draft · not sent",
	published: "Sent",
	canceled: "Canceled",
} as const;

function EditEvent() {
	const { eventId } = Route.useParams();
	const { data } = useSuspenseQuery(eventQuery(eventId));
	return (
		<Page className="gap-7">
			<EventCrumbs eventId={eventId} title={data.event.title} here="Edit" />
			<PageHead
				kicker={STATUS[data.event.status]}
				title={<EventTitleLink eventId={eventId} title={data.event.title} />}
			/>
			<EventEditor key={data.event.id} loaded={data} />
		</Page>
	);
}
