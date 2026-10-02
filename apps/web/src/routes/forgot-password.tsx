import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/controls";
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
		<div className="mx-auto w-full max-w-[560px] px-[clamp(16px,4vw,40px)] pt-[clamp(12px,3vw,40px)] pb-20">
			<div className="flex flex-col gap-5 rounded-[28px] border border-line bg-panel p-[clamp(20px,3vw,32px)]">
				<span className="kicker text-lime">Password</span>
				<h1 className="m-0 text-[30px]">Forgot it. Happens.</h1>
				{sent ? (
					<p className="m-0 text-[15px] text-soft">
						If that address is on file, a link is on its way. It works for an
						hour. Check spam if it doesn't show.
					</p>
				) : (
					<form onSubmit={submit} className="flex flex-col gap-4">
						<Field label="Email" htmlFor="email">
							<Input
								id="email"
								type="email"
								required
								autoComplete="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</Field>
						<Button type="submit" className="w-full" disabled={busy}>
							{busy ? "Sending..." : "Send me a reset link"}
						</Button>
					</form>
				)}
				<div>
					<Link to="/login" className="text-[14px]">
						Back to sign in
					</Link>
				</div>
			</div>
		</div>
	);
}
