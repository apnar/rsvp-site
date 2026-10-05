import { Button } from "@rsvp-site/ui/components/button";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";

import { pageTitle } from "@/content/site";
import { orpc } from "@/utils/orpc";

const claimQuery = (token: string) =>
	orpc.contact.claim.queryOptions({ input: { token } });

/**
 * Where the link in a "confirm your address" email lands. Opening it adds
 * nothing: mail scanners open links by themselves, and if the address was
 * a typo, a stranger's scanner would be confirming it. The button does.
 */
export const Route = createFileRoute("/confirm-email")({
	validateSearch: z.object({ k: z.string().catch("") }),
	loaderDeps: ({ search }) => ({ k: search.k }),
	loader: ({ context, deps }) =>
		deps.k
			? context.queryClient.ensureQueryData(claimQuery(deps.k))
			: undefined,
	head: () => ({
		meta: [
			{ title: pageTitle("Confirm your address") },
			// The key in the URL is the request.
			{ name: "robots", content: "noindex" },
			{ name: "referrer", content: "no-referrer" },
		],
	}),
	component: ConfirmEmailPage,
});

function ConfirmEmailPage() {
	const { k } = Route.useSearch();
	return (
		<div className="mx-auto w-full max-w-[560px] px-[clamp(16px,4vw,40px)] pt-[clamp(12px,3vw,40px)] pb-20">
			<div className="flex flex-col gap-5 rounded-[28px] border border-line bg-panel p-[clamp(20px,3vw,32px)]">
				<span className="kicker text-lime-ink">Your address</span>
				{k ? <Claim token={k} /> : <Gone />}
			</div>
		</div>
	);
}

function Claim({ token }: { token: string }) {
	const { data } = useSuspenseQuery(claimQuery(token));
	const confirm = useMutation(orpc.contact.confirm.mutationOptions());

	if (confirm.isSuccess || data.state === "done") {
		return (
			<>
				<h1 className="m-0 text-[30px]">You're set.</h1>
				<p className="m-0 text-[15px] text-soft">
					Invitations come to {confirm.data?.email ?? data.email} now, and every
					one signs you in.
				</p>
				<div>
					<Link to="/login" className="text-[14px]">
						Sign in
					</Link>
				</div>
			</>
		);
	}
	if (data.state === "expired") {
		return (
			<>
				<h1 className="m-0 text-[30px]">That link ran out.</h1>
				<p className="m-0 text-[15px] text-soft">
					Answer the invitation again and we'll send a fresh one.
				</p>
			</>
		);
	}
	if (data.state === "invalid") return <Gone />;
	return (
		<>
			<h1 className="m-0 text-[30px]">Is this you?</h1>
			<p className="m-0 text-[15px] text-soft">
				Somebody answering an invitation asked for their invitations to come to{" "}
				<b className="text-ink">{data.email}</b>. If that was you, confirm it.
			</p>
			<Button
				size="lg"
				disabled={confirm.isPending}
				onClick={() => confirm.mutate({ token })}
			>
				{confirm.isPending ? "Adding..." : "Yes, that's me"}
			</Button>
			<p className="m-0 text-[13px] text-haze">
				Not you? Close this page and nothing changes.
			</p>
		</>
	);
}

function Gone() {
	return (
		<>
			<h1 className="m-0 text-[30px]">Nothing to confirm.</h1>
			<p className="m-0 text-[15px] text-soft">
				That link isn't one we can use. It may already have done its job.
			</p>
		</>
	);
}
