import { Blueprint } from "@rsvp-site/ui/components/blueprint";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { Label } from "@rsvp-site/ui/components/label";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import SignInForm from "@/components/sign-in-form";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/login")({
	validateSearch: z.object({
		redirect: z.string().optional(),
		error: z.string().optional(),
	}),
	component: RouteComponent,
});

/** For guests with no password: mail them their link again. */
function RequestLink() {
	const [email, setEmail] = useState("");
	const [asked, setAsked] = useState(false);

	const request = useMutation(
		orpc.people.requestLink.mutationOptions({
			onSuccess: () => setAsked(true),
			onError: (error: Error) => toast.error(error.message),
		}),
	);

	return (
		<Blueprint className="mx-auto mt-6 w-full max-w-md p-6">
			<span className="kicker mb-3 block text-steel-700">No password?</span>
			<p className="text-[15px] text-neutral-700 leading-6">
				Most people never set one. Every link we email you signs you in. Lost
				the email and we will send another.
			</p>
			{asked ? (
				<p className="mt-4 text-[15px] leading-6">
					If that address is on the list, a link is on its way.
				</p>
			) : (
				<form
					className="mt-4 flex flex-wrap items-end gap-3"
					onSubmit={(e) => {
						e.preventDefault();
						request.mutate({ email });
					}}
				>
					<div className="min-w-[200px] flex-1 space-y-1.5">
						<Label htmlFor="link-email">Email</Label>
						<Input
							id="link-email"
							type="email"
							required
							autoComplete="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
					</div>
					<Button type="submit" variant="outline" disabled={request.isPending}>
						{request.isPending ? "Sending..." : "Email me my link"}
					</Button>
				</form>
			)}
		</Blueprint>
	);
}

function RouteComponent() {
	const { error } = Route.useSearch();

	return (
		<section className="pt-18 pb-15">
			{error === "link" ? (
				<p className="mx-auto mb-6 w-full max-w-md border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 leading-5">
					That link is not on the sheet. Ask the host for a fresh one, or use
					the form below.
				</p>
			) : null}
			{error === "revoked" ? (
				<p className="mx-auto mb-6 w-full max-w-md border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 leading-5">
					That account is deactivated, so its links no longer work. If that is
					news to you, talk to the host.
				</p>
			) : null}
			<SignInForm />
			<RequestLink />
		</section>
	);
}
