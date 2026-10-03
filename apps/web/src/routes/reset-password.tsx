import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Field } from "@/components/controls";
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
		<div className="mx-auto w-full max-w-[560px] px-[clamp(16px,4vw,40px)] pt-[clamp(12px,3vw,40px)] pb-20">
			<div className="flex flex-col gap-5 rounded-[28px] border border-line bg-panel p-[clamp(20px,3vw,32px)]">
				<span className="kicker text-lime-ink">Password</span>
				<h1 className="m-0 text-[30px]">
					{dead ? "That link is dead." : "Pick a new one."}
				</h1>
				{dead ? (
					<>
						<p className="m-0 text-[15px] text-soft">
							Reset links last an hour and work once. Ask for another.
						</p>
						<div>
							<Link to="/forgot-password" className="text-[14px]">
								Send a new link
							</Link>
						</div>
					</>
				) : (
					<form onSubmit={submit} className="flex flex-col gap-4">
						<Field label="New password" htmlFor="password">
							<Input
								id="password"
								type="password"
								required
								minLength={8}
								autoComplete="new-password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
							/>
						</Field>
						<Field label="Same again" htmlFor="confirm">
							<Input
								id="confirm"
								type="password"
								required
								minLength={8}
								autoComplete="new-password"
								value={confirm}
								onChange={(e) => setConfirm(e.target.value)}
							/>
						</Field>
						<Button type="submit" className="w-full" disabled={busy}>
							{busy ? "Saving..." : "Change password"}
						</Button>
					</form>
				)}
			</div>
		</div>
	);
}
