import { safeReturnPath } from "@rsvp-site/email/links";
import { Blueprint } from "@rsvp-site/ui/components/blueprint";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { Label } from "@rsvp-site/ui/components/label";
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
		<Blueprint className="mx-auto w-full max-w-md p-6">
			<span className="kicker mb-3 block text-steel-700">Sign in</span>
			<h1 className="mb-6 font-heading text-[32px] uppercase leading-9 tracking-[0.02em]">
				Back for more.
			</h1>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
				className="space-y-4"
			>
				<div>
					<form.Field name="email">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Email</Label>
								<Input
									id={field.name}
									name={field.name}
									type="email"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								{field.state.meta.errors.map((error) => (
									<p key={error?.message} className="text-destructive text-xs">
										{error?.message}
									</p>
								))}
							</div>
						)}
					</form.Field>
				</div>

				<div>
					<form.Field name="password">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Password</Label>
								<Input
									id={field.name}
									name={field.name}
									type="password"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								{field.state.meta.errors.map((error) => (
									<p key={error?.message} className="text-destructive text-xs">
										{error?.message}
									</p>
								))}
							</div>
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
							{isSubmitting ? "Submitting..." : "Sign In"}
						</Button>
					)}
				</form.Subscribe>
			</form>

			<div className="mt-4 flex flex-wrap items-center justify-between gap-2">
				<span className="text-[13px] text-neutral-700 leading-6">
					No account? The host makes those.
				</span>
				<Link
					to="/forgot-password"
					className="text-[13px] text-steel-700 leading-6"
				>
					Forgot it? Happens to the best of us.
				</Link>
			</div>
		</Blueprint>
	);
}
