import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Wordmark } from "@/components/brand";
import { EventHero } from "@/components/event-hero";
import { pageTitle } from "@/content/site";
import { designSrc } from "@/lib/design-src";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/i/$token")({
	staticData: { ownHeader: true },
	/**
	 * Signed in, a share link puts you on the list and takes you to the
	 * invite. That is a write on a GET, which the email links avoid -- but
	 * this one only runs for somebody already holding a session, and joining
	 * is exactly what they came to the link to do.
	 */
	beforeLoad: async ({ context, params }) => {
		if (!context.session) return;
		const { eventId } = await client.events.claimJoin({ token: params.token });
		throw redirect({ to: "/e/$eventId", params: { eventId } });
	},
	loader: ({ context, params }) =>
		context.queryClient.ensureQueryData(
			orpc.events.teaser.queryOptions({ input: { token: params.token } }),
		),
	head: ({ loaderData }) => ({
		meta: [
			{
				title: pageTitle(loaderData ? loaderData.title : "You're invited"),
			},
			{ name: "robots", content: "noindex" },
			...(loaderData
				? [
						{ property: "og:title", content: loaderData.title },
						{ property: "og:type", content: "website" },
						...(loaderData.imageUrl
							? [
									{ property: "og:image", content: loaderData.imageUrl },
									{ name: "twitter:card", content: "summary_large_image" },
								]
							: []),
					]
				: []),
			...(loaderData?.design
				? [{ name: "theme-color", content: loaderData.design.theme.bg }]
				: []),
		],
	}),
	component: Teaser,
});

function Teaser() {
	const { token } = Route.useParams();
	const { data } = useSuspenseQuery(
		orpc.events.teaser.queryOptions({ input: { token } }),
	);
	const [email, setEmail] = useState("");
	const [sent, setSent] = useState(false);
	const join = useMutation(
		orpc.events.join.mutationOptions({
			onSuccess: () => setSent(true),
			onError: (error: Error) => toast.error(error.message),
		}),
	);
	const canceled = data.status === "canceled";

	return (
		<EventHero
			header={
				<header className="relative mx-auto flex w-full max-w-[1180px] items-center px-[clamp(16px,4vw,40px)] py-[18px]">
					<Link to="/" className="no-underline">
						<Wordmark />
					</Link>
				</header>
			}
			coverKey={data.coverKey}
			theme={data.design?.theme}
			card={
				data.design ? (
					<img
						src={designSrc(data.design.cardKey)}
						alt={[data.title, data.dateLabel, data.timeLabel]
							.filter(Boolean)
							.join(" · ")}
						className="mx-auto block h-auto max-h-[78vh] w-auto max-w-full rounded-[6px] shadow-float"
					/>
				) : null
			}
			size="teaser"
			tone={canceled ? "ink" : "lime"}
			status={canceled ? "Canceled" : "You're invited"}
			title={data.title}
			dateLabel={data.dateLabel}
			timeLabel={data.timeLabel}
			hostLine={data.hostLine}
		>
			{canceled ? null : (
				<div className="mt-4 flex max-w-[560px] flex-col gap-3 rounded-[28px] border border-line bg-panel p-[clamp(20px,3vw,28px)]">
					{sent ? (
						<>
							<h2 className="m-0 text-[24px]">Check your email.</h2>
							<p className="m-0 text-soft">
								We sent a link to {email}. Tap it to see where and when, and to
								answer.
							</p>
						</>
					) : (
						<>
							<h2 className="m-0 text-[24px]">Coming?</h2>
							<p className="m-0 text-soft">
								Put in your email and we'll send you a link with the details and
								a one-tap RSVP. No password needed.
							</p>
							<form
								className="flex flex-wrap gap-2"
								onSubmit={(e) => {
									e.preventDefault();
									join.mutate({ token, email });
								}}
							>
								<label htmlFor="join-email" className="sr-only">
									Email
								</label>
								<Input
									id="join-email"
									type="email"
									required
									autoComplete="email"
									placeholder="you@example.com"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									className="min-w-0 flex-[1_1_220px]"
								/>
								<Button type="submit" disabled={join.isPending}>
									{join.isPending ? "Sending..." : "Send my link"}
								</Button>
							</form>
							<p className="m-0 text-[13px] text-haze">
								Already have an account?{" "}
								<Link to="/login" search={{ redirect: `/i/${token}` }}>
									Sign in
								</Link>
								.
							</p>
						</>
					)}
				</div>
			)}
		</EventHero>
	);
}
