import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { BringSomeone } from "@/components/invite/bring-someone";
import { HostPanel } from "@/components/invite/host-panel";
import { InviteView } from "@/components/invite/invite-view";
import { initialRsvp, RsvpForm } from "@/components/invite/rsvp-form";
import { useRecordView } from "@/components/invite/use-record-view";
import { pageTitle } from "@/content/site";
import { orNotFound } from "@/lib/not-found";
import { client, orpc } from "@/utils/orpc";

const inviteQuery = (eventId: string) =>
	orpc.events.invite.queryOptions({ input: { eventId } });

export const Route = createFileRoute("/_auth/e/$eventId/")({
	staticData: { ownHeader: true },
	// `a` is the answer an email button carried. It is shown picked but not
	// saved: mail clients fetch links on their own, so nothing is recorded
	// until a person presses the button.
	validateSearch: z.object({
		a: z.enum(["yes", "maybe", "no"]).optional().catch(undefined),
	}),
	loader: ({ context, params }) =>
		orNotFound(
			context.queryClient.ensureQueryData(inviteQuery(params.eventId)),
		),
	head: ({ loaderData }) => ({
		meta: [
			{
				title: pageTitle(loaderData?.event.title),
			},
			// The page is behind a sign-in, but say it anyway.
			{ name: "robots", content: "noindex" },
			...(loaderData?.design
				? [{ name: "theme-color", content: loaderData.design.theme.bg }]
				: []),
		],
	}),
	component: InvitePage,
});

function InvitePage() {
	const { eventId } = Route.useParams();
	const { a } = Route.useSearch();
	const { data } = useSuspenseQuery(inviteQuery(eventId));
	const respond = useMutation(orpc.guests.respond.mutationOptions());
	// The host sees their own page for their own reasons; the server
	// decides who counts, this only saves it the call.
	useRecordView(data.me && !data.isHost ? eventId : null, () =>
		client.guests.viewed({ eventId }),
	);

	return (
		<InviteView
			data={data}
			aside={
				data.me && data.event.status !== "canceled" ? (
					<div className="flex flex-col gap-5">
						{/* A co-host the owner also invited still needs the way to
						    the controls; the form alone would hide them. */}
						{data.isHost ? <HostPanel data={data} /> : null}
						<RsvpForm
							data={data}
							initial={initialRsvp(data.me, a ?? null)}
							submit={(values, options) =>
								respond.mutate({ eventId, ...values }, options)
							}
							pending={respond.isPending}
						/>
						<BringSomeone data={data} />
					</div>
				) : (
					<HostPanel data={data} />
				)
			}
		/>
	);
}
