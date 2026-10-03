import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Wordmark } from "@/components/brand";
import { Cover } from "@/components/cover";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/i/$token")({
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
				title: loaderData
					? `${loaderData.title} · Botch RSVP`
					: "You're invited · Botch RSVP",
			},
			{ name: "robots", content: "noindex" },
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
		<section className="relative flex min-h-svh flex-col overflow-hidden">
			<div className="absolute inset-0">
				<Cover coverKey={data.coverKey} />
			</div>
			<div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-night)_55%,transparent)_0%,color-mix(in_oklab,var(--color-night)_30%,transparent)_35%,var(--color-night)_85%)]" />
			<header className="relative mx-auto flex w-full max-w-[1180px] items-center px-[clamp(16px,4vw,40px)] py-[18px]">
				<Link to="/" className="no-underline">
					<Wordmark />
				</Link>
			</header>
			<div className="relative mx-auto mt-auto flex w-full max-w-[1180px] flex-col gap-[18px] px-[clamp(16px,4vw,40px)] pb-[clamp(32px,6vw,72px)]">
				<span className="self-start rounded-full bg-lime px-3.5 py-1.5 font-bold text-[13px] text-on-lime uppercase tracking-[0.08em]">
					{canceled ? "Canceled" : "You're invited"}
				</span>
				<h1 className="m-0 max-w-[14ch] font-black text-[clamp(40px,7.4vw,96px)] leading-[0.95] tracking-[-0.04em]">
					{data.title}
				</h1>
				<div className="flex flex-wrap gap-x-7 gap-y-2 font-medium text-[17px]">
					{data.dateLabel ? <span>{data.dateLabel}</span> : null}
					{data.timeLabel ? (
						<span className="text-lime-ink">{data.timeLabel}</span>
					) : null}
					{data.hostLine ? (
						<span className="text-haze">Hosted by {data.hostLine}</span>
					) : null}
				</div>
				{canceled ? null : (
					<div className="mt-4 flex max-w-[560px] flex-col gap-3 rounded-[28px] border border-line bg-panel p-[clamp(20px,3vw,28px)]">
						{sent ? (
							<>
								<h2 className="m-0 text-[24px]">Check your email.</h2>
								<p className="m-0 text-soft">
									We sent a link to {email}. Tap it to see where and when, and
									to answer.
								</p>
							</>
						) : (
							<>
								<h2 className="m-0 text-[24px]">Coming?</h2>
								<p className="m-0 text-soft">
									Put in your email and we'll send you a link with the details
									and a one-tap RSVP. No password needed.
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
			</div>
		</section>
	);
}
