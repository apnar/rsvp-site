import { canHost } from "@rsvp-site/db/roles";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { EventEditor } from "@/components/event-editor";
import { Page, PageHead } from "@/components/page";
import { pageTitle } from "@/content/site";

export const Route = createFileRoute("/_auth/e/new")({
	// The cookie's role may be five minutes stale; the API checks D1 again on
	// save, so this only spares a plain guest a form they cannot submit.
	beforeLoad: ({ context }) => {
		if (!canHost(context.session.user)) throw redirect({ to: "/events" });
	},
	head: () => ({ meta: [{ title: pageTitle("New event") }] }),
	component: NewEvent,
});

function NewEvent() {
	return (
		<Page className="gap-7">
			<PageHead kicker="New event" title="Let's throw a party." />
			<EventEditor />
		</Page>
	);
}
