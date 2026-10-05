import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AfterAnswer, dietPeople } from "@/components/invite/after-answer";
import { BringSomeone } from "@/components/invite/bring-someone";
import { HostBar } from "@/components/invite/host-bar";
import { InviteView } from "@/components/invite/invite-view";
import {
	initialRsvp,
	RsvpForm,
	type RsvpValues,
} from "@/components/invite/rsvp-form";
import type { Invite } from "@/components/invite/types";
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

/**
 * A guest who hasn't answered yet, for a host who is not on the list: the
 * form they preview is the one a guest the hosts chose would get. The name
 * is the one the designed card uses for nobody in particular.
 */
function previewGuest(data: Invite): NonNullable<Invite["me"]> {
	return {
		guestId: "",
		response: null,
		adults: 1,
		kids: 0,
		partyDiet: "",
		diet: { diets: [], note: "", confirmed: false },
		userId: "",
		note: "",
		claims: [],
		name: "your guest",
		firstName: "your guest",
		friends: [],
		family: [],
		canInvite: data.guestsMayInvite,
		invitesLeft: data.event.guestInviteLimit,
		missing: { email: false, phone: false },
	};
}

function InvitePage() {
	const { eventId } = Route.useParams();
	const { a } = Route.useSearch();
	const { data } = useSuspenseQuery(inviteQuery(eventId));
	const respond = useMutation(orpc.guests.respond.mutationOptions());
	const addContact = useMutation(orpc.contact.add.mutationOptions());
	const saveDiets = useMutation(orpc.diet.save.mutationOptions());
	// Opened by an answer: the answer it was, which decides whose diets to check.
	const [asking, setAsking] = useState<RsvpValues | null>(null);
	// The host sees their own page for their own reasons; the server
	// decides who counts, this only saves it the call.
	useRecordView(data.me && !data.isHost ? eventId : null, () =>
		client.guests.viewed({ eventId }),
	);

	// A host on the list answers for real; one who isn't gets a guest's
	// form that saves nothing.
	const preview = !data.me;
	const me = data.me ?? previewGuest(data);
	const shown = { ...data, me };
	const canceled = data.event.status === "canceled";

	return (
		<InviteView
			data={shown}
			banner={data.isHost ? <HostBar data={data} /> : null}
			aside={
				canceled ? (
					<section className="flex flex-col gap-4 rounded-[28px] border border-line bg-panel p-[clamp(20px,3vw,32px)]">
						<span className="kicker text-lime-ink">Canceled</span>
						<h2 className="m-0 text-[30px]">This one's off.</h2>
						<p className="m-0 text-soft">
							Nothing to answer. Sorry to miss you.
						</p>
					</section>
				) : (
					<div className="flex flex-col gap-5">
						<RsvpForm
							data={shown}
							initial={initialRsvp(me, shown.answers, a ?? null)}
							submit={(values, options) =>
								preview
									? toast("This is a preview. Guests answer here.")
									: respond.mutate(
											{ eventId, ...values },
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
								missing={me.missing}
								people={dietPeople(me, data.event.askDietary, asking)}
								saveDiets={(people, options) =>
									saveDiets.mutate({ people }, options)
								}
								submitContact={(values, options) =>
									addContact.mutate(values, options)
								}
								pending={addContact.isPending || saveDiets.isPending}
								onClose={() => setAsking(null)}
							/>
						) : null}
						<BringSomeone data={shown} preview={preview} />
					</div>
				)
			}
		/>
	);
}
