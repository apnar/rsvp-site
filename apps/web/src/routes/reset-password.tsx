import { Blueprint } from "@rsvp-site/ui/components/blueprint";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { Label } from "@rsvp-site/ui/components/label";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/reset-password")({
	validateSearch: z.object({
		token: z.string().optional(),
		error: z.string().optional(),
	}),
	component: ResetPasswordPage,
});

function ResetPasswordPage() {
	const { token, error } = Route.useSearch();
	const navigate = useNavigate();
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [busy, setBusy] = useState(false);

	const dead = !token || Boolean(error);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!token) return;
		if (password.length < 8) {
			toast.error("Eight characters minimum. Anything shorter is a guess.");
			return;
		}
		if (password !== confirm) {
			toast.error("Those two do not match.");
			return;
		}
		setBusy(true);
		const result = await authClient.resetPassword({
			newPassword: password,
			token,
		});
		setBusy(false);
		if (result.error) {
			toast.error(result.error.message || "That link did not work.");
			return;
		}
		toast.success("Password changed. Sign in with the new one.");
		navigate({ to: "/login" });
	};

	return (
		<section className="pt-18 pb-15">
			<Blueprint className="mx-auto w-full max-w-md p-6">
				<span className="kicker mb-3 block text-steel-700">Password</span>
				<h1 className="mb-6 font-heading text-[32px] uppercase leading-9 tracking-[0.02em]">
					{dead ? "That link is dead." : "Pick a new one."}
				</h1>
				{dead ? (
					<>
						<p className="text-[15px] leading-6">
							Reset links last an hour and work once. Ask for another and move
							faster this time.
						</p>
						<div className="mt-4">
							<Link
								to="/forgot-password"
								className="text-[13px] text-steel-700 leading-6"
							>
								Send a new link
							</Link>
						</div>
					</>
				) : (
					<form onSubmit={submit} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="password">New password</Label>
							<Input
								id="password"
								type="password"
								required
								minLength={8}
								autoComplete="new-password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="confirm">Same again</Label>
							<Input
								id="confirm"
								type="password"
								required
								minLength={8}
								autoComplete="new-password"
								value={confirm}
								onChange={(e) => setConfirm(e.target.value)}
							/>
						</div>
						<Button type="submit" className="w-full" disabled={busy}>
							{busy ? "Saving..." : "Change password"}
						</Button>
					</form>
				)}
			</Blueprint>
		</section>
	);
}
