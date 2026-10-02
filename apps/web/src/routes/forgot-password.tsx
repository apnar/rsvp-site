import { Blueprint } from "@rsvp-site/ui/components/blueprint";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { Label } from "@rsvp-site/ui/components/label";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/forgot-password")({
	component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
	const [email, setEmail] = useState("");
	const [busy, setBusy] = useState(false);
	const [sent, setSent] = useState(false);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		setBusy(true);
		const result = await authClient.requestPasswordReset({
			email,
			redirectTo: "/reset-password",
		});
		setBusy(false);
		if (result.error) {
			toast.error(result.error.message || "Something went sideways.");
			return;
		}
		setSent(true);
	};

	return (
		<section className="pt-18 pb-15">
			<Blueprint className="mx-auto w-full max-w-md p-6">
				<span className="kicker mb-3 block text-steel-700">Password</span>
				<h1 className="mb-6 font-heading text-[32px] uppercase leading-9 tracking-[0.02em]">
					Forgot it. Happens.
				</h1>
				{sent ? (
					<p className="text-[15px] leading-6">
						If that address is on file, a link is on its way. It works for an
						hour. Check spam before you check with the host.
					</p>
				) : (
					<form onSubmit={submit} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								required
								autoComplete="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</div>
						<Button type="submit" className="w-full" disabled={busy}>
							{busy ? "Sending..." : "Send me a reset link"}
						</Button>
					</form>
				)}
				<div className="mt-4">
					<Link to="/login" className="text-[13px] text-steel-700 leading-6">
						Back to sign in
					</Link>
				</div>
			</Blueprint>
		</section>
	);
}
