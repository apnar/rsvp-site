import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AfterAnswer, dietPeople } from "@/components/invite/after-answer";
import { InviteView } from "@/components/invite/invite-view";
import {
	initialRsvp,
	RsvpForm,
	type RsvpValues,
} from "@/components/invite/rsvp-form";
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
	const saveDiets = useMutation(orpc.paper.saveDiet.mutationOptions());
	// Opened by an answer: the answer it was, which decides whose diets to check.
	const [asking, setAsking] = useState<RsvpValues | null>(null);
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
											setAsking(values);
										},
									},
								)
							}
							pending={respond.isPending}
						/>
						{asking ? (
							<AfterAnswer
								// A fresh answer is a fresh check.
								key={JSON.stringify(asking)}
								missing={data.me.missing}
								people={dietPeople(data.me, data.event.askDietary, asking)}
								saveDiets={(people, options) =>
									saveDiets.mutate({ token, people }, options)
								}
								submitContact={(values, options) =>
									addContact.mutate({ token, ...values }, options)
								}
								pending={addContact.isPending || saveDiets.isPending}
								onClose={() => setAsking(null)}
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
