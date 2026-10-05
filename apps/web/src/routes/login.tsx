import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { Notice } from "@/components/notice";
import SignInForm from "@/components/sign-in-form";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/login")({
	validateSearch: z.object({
		redirect: z.string().optional().catch(undefined),
		error: z.string().optional().catch(undefined),
	}),
	component: RouteComponent,
});

/**
 * The usual way in: every email we send signs you in, and this sends one.
 * Says the same thing whether or not the address is on the site.
 */
function RequestLink() {
	const [email, setEmail] = useState("");
	const [asked, setAsked] = useState(false);

	const onSuccess = () => setAsked(true);
	const request = useMutation(
		orpc.people.requestLink.mutationOptions({ onSuccess }),
	);
	const requestText = useMutation(
		orpc.people.requestTextLink.mutationOptions({ onSuccess }),
	);
	// Anything without an "@" and with a phone's worth of digits is a number;
	// the server still decides whether it is one we can text.
	const isPhone = !email.includes("@") && email.replace(/\D/g, "").length >= 10;
	const pending = request.isPending || requestText.isPending;

	return (
		<div className="flex flex-col gap-4 rounded-[28px] bg-lime p-[clamp(20px,3vw,32px)] text-on-lime">
			<div>
				<span className="kicker">No password needed</span>
				<h1 className="mt-1.5 mb-0 text-[26px]">Email me a link</h1>
			</div>
			<p className="m-0 text-[15px]">
				Every invitation signs you in. Lost it? We'll send a fresh link.
			</p>
			{asked ? (
				<p className="m-0 font-bold text-[16px]">
					{isPhone
						? "If that number is on file, we just texted you a link."
						: "If that address is on the site, a link is on its way."}
				</p>
			) : (
				<form
					className="flex flex-wrap gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						request.mutate({ email });
					}}
				>
					<label htmlFor="link-email" className="sr-only">
						Email
					</label>
					<Input
						id="link-email"
						type="text"
						inputMode="email"
						required
						autoComplete="username"
						placeholder="Email or mobile number"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className="min-w-[200px] flex-1 border-night/30 bg-ink text-on-ink placeholder:text-on-ink/50 hover:border-night focus-visible:border-night"
					/>
					<Button type="submit" variant="night" disabled={pending}>
						{pending ? "Sending..." : "Send it"}
					</Button>
				</form>
			)}
		</div>
	);
}

function RouteComponent() {
	const { error } = Route.useSearch();

	return (
		<div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-[clamp(16px,4vw,40px)] pt-[clamp(12px,3vw,40px)] pb-20">
			{error === "link" ? (
				<Notice>
					That link doesn't work any more. Ask for a fresh one below.
				</Notice>
			) : null}
			{error === "paper" ? (
				<Notice>
					That invitation's code doesn't work any more. Ask the hosts for a new
					card, or sign in below.
				</Notice>
			) : null}
			{error === "revoked" ? (
				<Notice>
					That account is deactivated, so its links no longer work. If that's
					news to you, talk to whoever invited you.
				</Notice>
			) : null}
			<RequestLink />
			<SignInForm />
		</div>
	);
}
