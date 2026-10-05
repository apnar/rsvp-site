import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ContactAsk } from "@/components/invite/contact-ask";
import { InviteView } from "@/components/invite/invite-view";
import { initialRsvp, RsvpForm } from "@/components/invite/rsvp-form";
import { useRecordView } from "@/components/invite/use-record-view";
import { pageTitle } from "@/content/site";
import { orNotFound } from "@/lib/not-found";
import { client, orpc } from "@/utils/orpc";

const paperQuery = (token: string) =>
	orpc.paper.invite.queryOptions({ input: { token } });

/**
 * Where a printed card's QR code lands. The key on the card opens this one
 * invitation and answers it, and signs nobody in: the host printed the
 * card and holds the key, so it can't be a way into the guest's account.
 */
export const Route = createFileRoute("/p/$token")({
	staticData: { ownHeader: true },
	loader: ({ context, params }) =>
		orNotFound(context.queryClient.ensureQueryData(paperQuery(params.token))),
	head: ({ loaderData }) => ({
		meta: [
			{ title: pageTitle(loaderData?.event.title) },
			// The key in the URL is the invitation.
			{ name: "robots", content: "noindex" },
			{ name: "referrer", content: "no-referrer" },
			...(loaderData?.design
				? [{ name: "theme-color", content: loaderData.design.theme.bg }]
				: []),
		],
	}),
	component: PaperInvitePage,
});

function PaperInvitePage() {
	const { token } = Route.useParams();
	const { data } = useSuspenseQuery(paperQuery(token));
	const respond = useMutation(orpc.paper.respond.mutationOptions());
	const addContact = useMutation(orpc.paper.addContact.mutationOptions());
	const [asking, setAsking] = useState(false);
	useRecordView(token, () => client.paper.viewed({ token }));

	return (
		<InviteView
			data={data}
			aside={
				data.me && data.event.status !== "canceled" ? (
					<div className="flex flex-col gap-5">
						<RsvpForm
							data={data}
							initial={initialRsvp(data.me, data.answers, null)}
							submit={(values, options) =>
								respond.mutate(
									{ token, ...values },
									{
										onSuccess: (result) => {
											options.onSuccess(result);
											setAsking(true);
										},
									},
								)
							}
							pending={respond.isPending}
						/>
						{asking && (data.me.missing.email || data.me.missing.phone) ? (
							<ContactAsk
								missing={data.me.missing}
								submit={(values, options) =>
									addContact.mutate({ token, ...values }, options)
								}
								pending={addContact.isPending}
								onClose={() => setAsking(false)}
							/>
						) : null}
						<p className="m-0 text-[14px] text-haze">
							This card answers for {data.me.name}
							{data.me.family.length > 0
								? ", and for their family on the list"
								: ""}{" "}
							at this party. To see your other invitations,{" "}
							<Link to="/login" className="text-lime-ink">
								sign in with your email
							</Link>
							.
						</p>
					</div>
				) : null
			}
		/>
	);
}
