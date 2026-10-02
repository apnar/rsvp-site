import { Blueprint } from "@rsvp-site/ui/components/blueprint";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { Label } from "@rsvp-site/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { BreakForm, describeBreak } from "@/components/break-form";
import SectionKicker from "@/components/section-kicker";
import { authClient } from "@/lib/auth-client";
import { describeContribution } from "@/lib/contributions";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/dashboard")({
	component: RouteComponent,
});

/**
 * Passwords are optional here. Most people get in from the links we email
 * them; a password is for anyone who would rather type one.
 */
function PasswordRow() {
	const queryClient = useQueryClient();
	const has = useQuery(orpc.account.hasPassword.queryOptions());
	const [open, setOpen] = useState(false);
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [busy, setBusy] = useState(false);

	const hasPassword = has.data?.hasPassword ?? false;

	const setPassword = useMutation(
		orpc.account.setPassword.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.account.key() });
				setOpen(false);
				setNext("");
				toast.success("Password set. The emailed links still work.");
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);

	const change = async (e: React.FormEvent) => {
		e.preventDefault();
		setBusy(true);
		const result = await authClient.changePassword({
			currentPassword: current,
			newPassword: next,
		});
		setBusy(false);
		if (result.error) {
			toast.error(result.error.message || "That did not take.");
			return;
		}
		setOpen(false);
		setCurrent("");
		setNext("");
		toast.success("Changed.");
	};

	return (
		<>
			<dt className="kicker text-steel-700">Password</dt>
			<dd className="m-0 flex flex-wrap items-baseline gap-x-3">
				<span>
					{has.isLoading
						? "Checking..."
						: hasPassword
							? "Set. The emailed links work either way."
							: "None. The links in your email are how you get in."}
				</span>
				{has.isLoading ? null : (
					<Button variant="link" size="xs" onClick={() => setOpen((v) => !v)}>
						{open ? "Never mind" : hasPassword ? "Change it" : "Set one"}
					</Button>
				)}
			</dd>
			{open ? (
				<dd className="col-span-2 m-0">
					<form
						className="flex flex-wrap items-end gap-3"
						onSubmit={
							hasPassword
								? change
								: (e) => {
										e.preventDefault();
										setPassword.mutate({ newPassword: next });
									}
						}
					>
						{hasPassword ? (
							<div className="min-w-[180px] space-y-1.5">
								<Label htmlFor="current-password">Current</Label>
								<Input
									id="current-password"
									type="password"
									required
									autoComplete="current-password"
									value={current}
									onChange={(e) => setCurrent(e.target.value)}
								/>
							</div>
						) : null}
						<div className="min-w-[180px] space-y-1.5">
							<Label htmlFor="new-password">New password</Label>
							<Input
								id="new-password"
								type="password"
								required
								minLength={8}
								autoComplete="new-password"
								value={next}
								onChange={(e) => setNext(e.target.value)}
							/>
						</div>
						<Button
							type="submit"
							size="sm"
							disabled={busy || setPassword.isPending}
						>
							Save
						</Button>
					</form>
				</dd>
			) : null}
		</>
	);
}

function RouteComponent() {
	const { session } = Route.useRouteContext();
	const queryClient = useQueryClient();
	const me = useQuery(orpc.people.me.queryOptions());
	const money = useQuery(orpc.contributions.mine.queryOptions());
	const [taking, setTaking] = useState(false);
	const [resent, setResent] = useState(false);

	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: orpc.people.key() });
		queryClient.invalidateQueries({ queryKey: orpc.rsvp.key() });
	};
	const onError = (error: Error) => toast.error(error.message);

	const takeBreak = useMutation(
		orpc.people.suspend.mutationOptions({
			onSuccess: () => {
				setTaking(false);
				refresh();
				toast.success("Spot held. See you when you're back.");
			},
			onError,
		}),
	);
	const comeBack = useMutation(
		orpc.people.unsuspend.mutationOptions({
			onSuccess: () => {
				refresh();
				toast.success("You're back on. See you at the next one.");
			},
			onError,
		}),
	);

	const resend = async () => {
		if (!session) return;
		const result = await authClient.sendVerificationEmail({
			email: session.user.email,
			callbackURL: "/dashboard",
		});
		if (result.error) {
			toast.error(result.error.message || "Could not send it.");
			return;
		}
		setResent(true);
		toast.success("Sent. Check spam before you check with the host.");
	};

	const verified = session?.user.emailVerified ?? false;
	const away = me.data?.status === "suspended";

	return (
		<section className="pt-18 pb-15">
			<h1 className="-ml-[0.05em] font-heading text-[clamp(40px,6vw,80px)] uppercase leading-[1.02] tracking-[0.01em]">
				<span className="block">Welcome, {session?.user.name}.</span>
				<span className="block text-steel-700">
					{away ? "You're taking a break." : "You're on the list."}
				</span>
			</h1>
			<div className="mt-10">
				<SectionKicker className="mb-5">05 · Your account</SectionKicker>
			</div>
			<Blueprint className="max-w-[560px] p-6">
				<dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-3 text-[15px] leading-6">
					<dt className="kicker text-steel-700">Name</dt>
					<dd className="m-0">{session?.user.name}</dd>
					<dt className="kicker text-steel-700">Email</dt>
					<dd className="m-0">
						{session?.user.email}
						{verified ? (
							<span className="ml-2 text-[13px] text-neutral-700">
								Verified
							</span>
						) : (
							<span className="ml-2 inline-flex flex-wrap items-baseline gap-x-2 text-[13px] text-neutral-700">
								Not verified.
								{resent ? (
									<span>Sent.</span>
								) : (
									<Button variant="link" size="xs" onClick={resend}>
										Resend the email
									</Button>
								)}
							</span>
						)}
					</dd>
					<dt className="kicker text-steel-700">Status</dt>
					<dd className="m-0 flex flex-wrap items-baseline gap-x-3">
						<span>
							{me.isLoading
								? "Checking..."
								: away
									? `${describeBreak({
											suspendedUntil: me.data?.suspendedUntil ?? null,
											reason: me.data?.reason ?? null,
										})}. No event emails, no spot on the sheet.`
									: "Active. Invitations, the headcount on the day, and a spot on the sheet."}
						</span>
						{me.isLoading ? null : away ? (
							<Button
								variant="link"
								size="xs"
								disabled={comeBack.isPending}
								onClick={() => comeBack.mutate({})}
							>
								I'm back
							</Button>
						) : (
							<Button
								variant="link"
								size="xs"
								onClick={() => setTaking((v) => !v)}
							>
								{taking ? "Never mind" : "Take a break..."}
							</Button>
						)}
					</dd>
					{taking && !away ? (
						<dd className="col-span-2 m-0">
							<BreakForm
								pending={takeBreak.isPending}
								onCancel={() => setTaking(false)}
								onSubmit={(input) => takeBreak.mutate(input)}
							/>
						</dd>
					) : null}
					{money.data ? (
						<>
							<dt className="kicker text-steel-700">Contributions</dt>
							<dd className="m-0">{describeContribution(money.data)}</dd>
						</>
					) : null}
					<PasswordRow />
					<dd className="col-span-2 m-0 text-[13px] text-neutral-600 leading-5">
						Done for good rather than for a month? Tell an admin — leaving the
						group is the one thing that does not happen from here.
					</dd>
				</dl>
			</Blueprint>
		</section>
	);
}
