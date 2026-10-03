import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import {
	createFileRoute,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/confirm-action";
import { Field, SettingRow, Switch } from "@/components/controls";
import { Page, PageHead, Panel } from "@/components/page";
import { pageTitle } from "@/content/site";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

const meQuery = () => orpc.account.me.queryOptions();
const hasPasswordQuery = () => orpc.account.hasPassword.queryOptions();

export const Route = createFileRoute("/_auth/account")({
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(meQuery()),
			context.queryClient.ensureQueryData(hasPasswordQuery()),
		]),
	head: () => ({ meta: [{ title: pageTitle("Your account") }] }),
	component: AccountPage,
});

const ROLE_LINE = {
	admin: "Admin: you can host, and manage people and roles.",
	host: "Host: you can make events and keep contact groups.",
	user: "Guest: you answer invitations. An admin can make you a host.",
} as const;

const REASON = {
	self: "You unsubscribed.",
	bounce: "Email to this address bounced, so it stopped.",
	spam: "A message was reported as spam, so email stopped.",
	invalid: "The address couldn't receive mail, so email stopped.",
} as const;

function AccountPage() {
	const { data: me } = useSuspenseQuery(meQuery());
	return (
		<Page>
			<PageHead kicker="Your account" title={me.name} />
			<div className="grid max-w-[1000px] grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-5">
				<NameAndEmail />
				<div className="flex flex-col gap-5">
					<EmailPrefs />
					<PasswordPanel />
					<SignOutEverywhere />
				</div>
			</div>
		</Page>
	);
}

function NameAndEmail() {
	const router = useRouter();
	const { data: me } = useSuspenseQuery(meQuery());
	const [name, setName] = useState(me.name);
	const save = useMutation(
		orpc.account.setName.mutationOptions({
			onSuccess: async () => {
				toast.success("Saved.");
				// The header reads the name from the session, which is not a
				// query; refetch it.
				await router.invalidate();
			},
		}),
	);
	return (
		<Panel
			as="form"
			onSubmit={(e) => {
				e.preventDefault();
				save.mutate({ name });
			}}
		>
			<h2 className="m-0 text-[20px]">You</h2>
			<Field label="Your name, as hosts and guests see it" htmlFor="name">
				<Input
					id="name"
					value={name}
					maxLength={60}
					onChange={(e) => setName(e.target.value)}
				/>
			</Field>
			<Field label="Email" htmlFor="email">
				<Input
					id="email"
					value={me.email || "No email on file"}
					readOnly
					disabled
				/>
			</Field>
			<p className="m-0 text-[14px] text-haze">{ROLE_LINE[me.role]}</p>
			<Button
				type="submit"
				className="self-start"
				disabled={save.isPending || !name.trim() || name === me.name}
			>
				Save
			</Button>
		</Panel>
	);
}

function EmailPrefs() {
	const { data: me } = useSuspenseQuery(meQuery());
	const on = me.unsubscribedAt === null;
	const setEmail = useMutation(
		orpc.account.setEmail.mutationOptions({
			onSuccess: (r) => {
				toast.success(r.unsubscribedAt ? "No more email." : "Email's back on.");
			},
		}),
	);
	// Somebody invited on paper by name alone: there is nothing to switch.
	if (!me.email) return null;
	return (
		<Panel className="gap-1">
			<h2 className="m-0 mb-2 text-[20px]">Email</h2>
			<SettingRow
				title="Invitations by email"
				hint={
					on
						? "Invitations, reminders and changes land in your inbox."
						: `${me.unsubscribeReason ? REASON[me.unsubscribeReason] : "Off."} Invitations still show up on the site.`
				}
			>
				<Switch
					label="Invitations by email"
					checked={on}
					onChange={(value) => setEmail.mutate({ on: value })}
				/>
			</SettingRow>
		</Panel>
	);
}

/**
 * Passwords are optional. Most people get in from the links we email them;
 * a password is for anyone who would rather type one.
 */
function PasswordPanel() {
	const { data: has } = useSuspenseQuery(hasPasswordQuery());
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const { hasPassword } = has;

	const setPassword = useMutation(
		orpc.account.setPassword.mutationOptions({
			onSuccess: () => {
				setNext("");
				toast.success("Password set. The emailed links still work.");
			},
		}),
	);

	// Better Auth reports a failure in the result rather than throwing; the
	// mutation needs it thrown to reset, toast and stop the spinner.
	const changePassword = useMutation({
		mutationFn: async () => {
			const result = await authClient.changePassword({
				currentPassword: current,
				newPassword: next,
			});
			if (result.error) {
				throw new Error(result.error.message || "That didn't take.");
			}
		},
		onSuccess: () => {
			setCurrent("");
			setNext("");
			toast.success("Changed.");
		},
	});

	const submit = (e: { preventDefault(): void }) => {
		e.preventDefault();
		if (hasPassword) changePassword.mutate();
		else setPassword.mutate({ newPassword: next });
	};

	return (
		<Panel as="form" onSubmit={submit}>
			<h2 className="m-0 text-[20px]">Password</h2>
			<p className="m-0 text-[14px] text-haze">
				{hasPassword
					? "Set. The links in your email work either way."
					: "None. The links in your email sign you in; set one if you'd rather type it."}
			</p>
			{hasPassword ? (
				<Field label="Current password" htmlFor="current-password">
					<Input
						id="current-password"
						type="password"
						required
						autoComplete="current-password"
						value={current}
						onChange={(e) => setCurrent(e.target.value)}
					/>
				</Field>
			) : null}
			<Field
				label="New password"
				htmlFor="new-password"
				hint="Eight characters or more."
			>
				<Input
					id="new-password"
					type="password"
					required
					minLength={8}
					autoComplete="new-password"
					value={next}
					onChange={(e) => setNext(e.target.value)}
				/>
			</Field>
			<Button
				type="submit"
				variant="outline"
				className="self-start"
				disabled={
					changePassword.isPending || setPassword.isPending || next.length < 8
				}
			>
				{hasPassword ? "Change it" : "Set a password"}
			</Button>
		</Panel>
	);
}

/**
 * A forwarded email, a shared computer, a lost phone: every link we have
 * mailed carries the same key, and it never expired on its own. This
 * replaces it and ends every session, this one included; the next email
 * brings the new link, or "Email me my link" on the sign-in page.
 */
function SignOutEverywhere() {
	const router = useRouter();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const out = useMutation(
		orpc.account.signOutEverywhere.mutationOptions({
			onSuccess: async () => {
				queryClient.clear();
				await router.invalidate();
				navigate({ to: "/login" });
			},
		}),
	);
	return (
		<Panel className="gap-3">
			<h2 className="m-0 text-[20px]">Sign out everywhere</h2>
			<p className="m-0 text-[14px] text-haze">
				Ends every session on every device and stops the links in emails you
				already have from working. Ask for a new link from the sign-in page.
			</p>
			<ConfirmAction
				confirm="Sign me out everywhere"
				pending={out.isPending}
				onConfirm={() => out.mutate({})}
				className="flex flex-wrap gap-1.5"
				trigger={{
					variant: "outline",
					size: "sm",
					className: "self-start",
					children: "Sign out everywhere",
				}}
			/>
		</Panel>
	);
}
