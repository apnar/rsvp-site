import { safeReturnPath } from "@rsvp-site/email/links";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { useForm } from "@tanstack/react-form";
import {
	Link,
	useNavigate,
	useRouter,
	useSearch,
} from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import { Field } from "./controls";

export default function SignInForm() {
	const navigate = useNavigate();
	const router = useRouter();
	const { redirect } = useSearch({ from: "/login" });

	const form = useForm({
		defaultValues: {
			email: "",
			password: "",
		},
		onSubmit: async ({ value }) => {
			await authClient.signIn.email(
				{
					email: value.email,
					password: value.password,
				},
				{
					onSuccess: async () => {
						// The session hangs off the root route's context, so the
						// router has to fetch it again before we move.
						await router.invalidate();
						navigate({ to: safeReturnPath(redirect) });
						toast.success("You're in.");
					},
					onError: (error) => {
						toast.error(error.error.message || error.error.statusText);
					},
				},
			);
		},
		validators: {
			onSubmit: z.object({
				email: z.email("Invalid email address"),
				password: z.string().min(8, "Password must be at least 8 characters"),
			}),
		},
	});

	return (
		<div className="flex flex-col gap-5 rounded-[28px] border border-line bg-panel p-[clamp(20px,3vw,32px)]">
			<div>
				<span className="kicker text-lime-ink">Sign in</span>
				<h1 className="mt-1.5 mb-0 text-[30px]">Back for more?</h1>
			</div>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
				className="flex flex-col gap-4"
			>
				<div>
					<form.Field name="email">
						{(field) => (
							<Field label="Email" htmlFor={field.name}>
								<Input
									id={field.name}
									name={field.name}
									type="email"
									autoComplete="email"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								{field.state.meta.errors.map((error) => (
									<p
										key={error?.message}
										className="m-0 text-destructive text-sm"
									>
										{error?.message}
									</p>
								))}
							</Field>
						)}
					</form.Field>
				</div>

				<div>
					<form.Field name="password">
						{(field) => (
							<Field label="Password" htmlFor={field.name}>
								<Input
									id={field.name}
									name={field.name}
									type="password"
									autoComplete="current-password"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								{field.state.meta.errors.map((error) => (
									<p
										key={error?.message}
										className="m-0 text-destructive text-sm"
									>
										{error?.message}
									</p>
								))}
							</Field>
						)}
					</form.Field>
				</div>

				<form.Subscribe
					selector={(state) => ({
						canSubmit: state.canSubmit,
						isSubmitting: state.isSubmitting,
					})}
				>
					{({ canSubmit, isSubmitting }) => (
						<Button
							type="submit"
							className="w-full"
							disabled={!canSubmit || isSubmitting}
						>
							{isSubmitting ? "Signing in..." : "Sign in"}
						</Button>
					)}
				</form.Subscribe>
			</form>

			<div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
				<span className="text-haze">
					No password? Most people don't. Use the email link above.
				</span>
				<Link to="/forgot-password">Forgot it?</Link>
			</div>
		</div>
	);
}
