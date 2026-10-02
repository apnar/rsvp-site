import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Field, SettingRow, Switch } from "@/components/controls";
import { Page, PageHead, Panel } from "@/components/page";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/account")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(orpc.account.me.queryOptions()),
	head: () => ({ meta: [{ title: "Your account · Botch RSVP" }] }),
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
	const { data: me } = useSuspenseQuery(orpc.account.me.queryOptions());
	return (
		<Page>
			<PageHead kicker="Your account" title={me.name} />
			<div className="grid max-w-[1000px] grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-5">
				<NameAndEmail />
				<div className="flex flex-col gap-5">
					<EmailPrefs />
					<PasswordPanel />
				</div>
			</div>
		</Page>
	);
}

function NameAndEmail() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { data: me } = useSuspenseQuery(orpc.account.me.queryOptions());
	const [name, setName] = useState(me.name);
	const save = useMutation(
		orpc.account.setName.mutationOptions({
			onSuccess: async () => {
				toast.success("Saved.");
				await queryClient.invalidateQueries({ queryKey: orpc.account.key() });
				// The header reads the name from the session; refetch it.
				await router.invalidate();
			},
			onError: (error: Error) => toast.error(error.message),
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
				<Input id="email" value={me.email} readOnly disabled />
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
	const queryClient = useQueryClient();
	const { data: me } = useSuspenseQuery(orpc.account.me.queryOptions());
	const on = me.unsubscribedAt === null;
	const setEmail = useMutation(
		orpc.account.setEmail.mutationOptions({
			onSuccess: (r) => {
				toast.success(r.unsubscribedAt ? "No more email." : "Email's back on.");
				queryClient.invalidateQueries({ queryKey: orpc.account.key() });
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);
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
	const queryClient = useQueryClient();
	const has = useQuery(orpc.account.hasPassword.queryOptions());
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [busy, setBusy] = useState(false);
	const hasPassword = has.data?.hasPassword ?? false;

	const setPassword = useMutation(
		orpc.account.setPassword.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.account.key() });
				setNext("");
				toast.success("Password set. The emailed links still work.");
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);

	const submit = async (e: { preventDefault(): void }) => {
		e.preventDefault();
		if (!hasPassword) {
			setPassword.mutate({ newPassword: next });
			return;
		}
		setBusy(true);
		const result = await authClient.changePassword({
			currentPassword: current,
			newPassword: next,
		});
		setBusy(false);
		if (result.error) {
			toast.error(result.error.message || "That didn't take.");
			return;
		}
		setCurrent("");
		setNext("");
		toast.success("Changed.");
	};

	return (
		<Panel as="form" onSubmit={submit}>
			<h2 className="m-0 text-[20px]">Password</h2>
			<p className="m-0 text-[14px] text-haze">
				{has.isLoading
					? "Checking..."
					: hasPassword
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
				disabled={busy || setPassword.isPending || next.length < 8}
			>
				{hasPassword ? "Change it" : "Set a password"}
			</Button>
		</Panel>
	);
}
