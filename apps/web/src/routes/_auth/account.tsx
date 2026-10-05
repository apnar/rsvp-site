import type { DietId } from "@rsvp-site/db/diets";
import { formatPhone } from "@rsvp-site/db/phone";
import { canHost } from "@rsvp-site/db/roles";
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
import { type ChangeEvent, useState } from "react";
import { toast } from "sonner";
import { AvatarField } from "@/components/avatar/avatar-field";
import { ConfirmAction } from "@/components/confirm-action";
import { Field, Segmented, SettingRow, Switch } from "@/components/controls";
import {
	DietFields,
	DietIcons,
	type DietValue,
	dietSummary,
	sameDiet,
} from "@/components/diet";
import { Page, PageHead, Panel } from "@/components/page";
import {
	changedDetails,
	type DetailKey,
	draftOf,
} from "@/components/person-details";
import { pageTitle } from "@/content/site";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

const meQuery = () => orpc.account.me.queryOptions();
const familyQuery = () => orpc.diet.family.queryOptions();
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
					<DietPanel />
					<ReachPrefs />
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
	const [draft, setDraft] = useState(() => draftOf(me));
	const patch = changedDetails(me, draft);
	const save = useMutation(
		orpc.account.setDetails.mutationOptions({
			onSuccess: async () => {
				toast.success("Saved.");
				// The header reads the name from the session, which is not a
				// query; refetch it.
				await router.invalidate();
			},
		}),
	);
	// The header reads the picture from the session too.
	const pictureSaved = async () => {
		await router.invalidate();
	};
	const setPicture = useMutation(
		orpc.account.setPicture.mutationOptions({
			onSuccess: async () => {
				toast.success("Picture saved.");
				await pictureSaved();
			},
		}),
	);
	const removePicture = useMutation(
		orpc.account.removePicture.mutationOptions({ onSuccess: pictureSaved }),
	);
	const field = (k: DetailKey, max = 100) => ({
		id: `me-${k}`,
		value: draft[k],
		maxLength: max,
		onChange: (e: ChangeEvent<HTMLInputElement>) =>
			setDraft((d) => ({ ...d, [k]: e.target.value })),
	});
	return (
		<Panel
			as="form"
			onSubmit={(e) => {
				e.preventDefault();
				save.mutate(patch);
			}}
		>
			<h2 className="m-0 text-[20px]">You</h2>
			<AvatarField
				name={me.name}
				image={me.image}
				mine
				pending={setPicture.isPending || removePicture.isPending}
				onSave={(file) => setPicture.mutateAsync({ file })}
				onRemove={() => removePicture.mutateAsync({})}
			/>
			<div className="grid grid-cols-2 gap-3">
				<Field label="First name" htmlFor="me-firstName">
					<Input {...field("firstName", 60)} autoComplete="given-name" />
				</Field>
				<Field label="Last name" htmlFor="me-lastName">
					<Input {...field("lastName", 60)} autoComplete="family-name" />
				</Field>
			</div>
			<Field label="Email" htmlFor="email">
				<Input
					id="email"
					value={me.email || "No email on file"}
					readOnly
					disabled
				/>
			</Field>
			<Field label="Mobile phone" htmlFor="me-phone">
				<Input {...field("phone", 40)} type="tel" autoComplete="tel" />
			</Field>
			<fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
				<legend className="mb-2 p-0 font-bold text-[14px]">
					Mailing address
				</legend>
				<Field label="Street address" htmlFor="me-addressLine1">
					<Input {...field("addressLine1")} autoComplete="address-line1" />
				</Field>
				<Field label="Apt / suite" htmlFor="me-addressLine2">
					<Input {...field("addressLine2")} autoComplete="address-line2" />
				</Field>
				<div className="grid grid-cols-2 gap-3">
					<Field label="City" htmlFor="me-city">
						<Input {...field("city", 60)} autoComplete="address-level2" />
					</Field>
					<Field label="State / region" htmlFor="me-region">
						<Input {...field("region", 60)} autoComplete="address-level1" />
					</Field>
					<Field label="ZIP / postal code" htmlFor="me-postalCode">
						<Input {...field("postalCode", 20)} autoComplete="postal-code" />
					</Field>
					<Field label="Country" htmlFor="me-country">
						<Input {...field("country", 60)} autoComplete="country-name" />
					</Field>
				</div>
			</fieldset>
			<p className="m-0 text-[14px] text-haze">{ROLE_LINE[me.role]}</p>
			<Button
				type="submit"
				className="self-start"
				disabled={
					save.isPending ||
					Object.keys(patch).length === 0 ||
					!draft.firstName.trim()
				}
			>
				Save
			</Button>
		</Panel>
	);
}

/**
 * Dietary needs belong to the person, not to each RSVP, so they are said
 * once here; relatives answer for each other, so they can be set here too.
 */
function DietPanel() {
	const router = useRouter();
	const { data: me } = useSuspenseQuery(meQuery());
	const { data: family } = useSuspenseQuery(familyQuery());
	const saved: DietValue = { diets: me.diets, note: me.dietNote };
	const [draft, setDraft] = useState(saved);
	const save = useMutation(
		orpc.account.setDetails.mutationOptions({
			onSuccess: async () => {
				toast.success("Saved.");
				await router.invalidate();
			},
		}),
	);
	return (
		<>
			<Panel
				as="form"
				onSubmit={(e) => {
					e.preventDefault();
					save.mutate({ diets: draft.diets, dietNote: draft.note });
				}}
			>
				<h2 className="m-0 text-[20px]">Dietary needs</h2>
				<p className="m-0 text-[14px] text-haze">
					The hosts of events you're on see this when they ask about diets, so
					you don't have to say it with every RSVP.
				</p>
				<DietFields value={draft} onChange={setDraft} idPrefix="me" />
				<Button
					type="submit"
					className="self-start"
					// Unchanged still saves for somebody never asked: "none" is an answer.
					disabled={
						save.isPending || (me.dietConfirmed && sameDiet(draft, saved))
					}
				>
					Save
				</Button>
			</Panel>
			{/* Its own panel, not inside the form above: Enter in a relative's
			    note must not save yours. */}
			{family.length > 0 ? (
				<Panel>
					<h2 className="m-0 text-[20px]">Your family's</h2>
					<p className="m-0 text-[14px] text-haze">
						You can set these for each other, since whoever answers for the
						family is often the one who knows.
					</p>
					{family.map((r) => (
						<RelativeDiet key={r.id} relative={r} />
					))}
				</Panel>
			) : null}
		</>
	);
}

function RelativeDiet({
	relative: r,
}: {
	relative: {
		id: string;
		name: string;
		child: boolean;
		diets: DietId[];
		dietNote: string;
	};
}) {
	const saved: DietValue = { diets: r.diets, note: r.dietNote };
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState(saved);
	const save = useMutation(
		orpc.diet.save.mutationOptions({
			onSuccess: () => {
				toast.success("Saved.");
				setOpen(false);
			},
		}),
	);
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="font-bold text-[15px]">
						{r.name}
						{r.child ? (
							<span className="ml-2 rounded-full border border-line px-2 py-0.5 font-semibold text-[11px] text-haze">
								kid
							</span>
						) : null}
					</span>
					<span className="flex items-center gap-2 text-[13px] text-haze">
						<DietIcons diets={r.diets} decorative />
						{dietSummary(saved)}
					</span>
				</div>
				{open ? null : (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => {
							setDraft(saved);
							setOpen(true);
						}}
					>
						Change
					</Button>
				)}
			</div>
			{open ? (
				<div className="flex flex-col gap-3">
					<DietFields
						value={draft}
						onChange={setDraft}
						idPrefix={`rel-${r.id}`}
					/>
					<div className="flex gap-2">
						<Button
							type="button"
							size="sm"
							disabled={save.isPending || sameDiet(draft, saved)}
							onClick={() =>
								save.mutate({
									people: [
										{ userId: r.id, diets: draft.diets, note: draft.note },
									],
								})
							}
						>
							Save
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setOpen(false)}
						>
							Cancel
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}

type Channel = "email" | "text" | "both";
const CHANNEL_LABEL: Record<Channel, string> = {
	email: "Email",
	text: "Text",
	both: "Both",
};

/**
 * Email and texts are separate permissions (a STOP reply must not touch
 * email, an unsubscribe must not touch texts), and the choice of which one
 * carries invitations is a third thing, so each gets its own row.
 */
function ReachPrefs() {
	const { data: me } = useSuspenseQuery(meQuery());
	const emailOn = Boolean(me.email) && me.unsubscribedAt === null;
	const setEmail = useMutation(
		orpc.account.setEmail.mutationOptions({
			onSuccess: (r) => {
				toast.success(r.unsubscribedAt ? "No more email." : "Email's back on.");
			},
		}),
	);
	const setTexts = useMutation(
		orpc.account.setTexts.mutationOptions({
			onSuccess: (r) => {
				toast.success(r?.textsOn ? "Texts are on." : "No more texts.");
			},
		}),
	);
	const setPrefs = useMutation(orpc.account.setContactPrefs.mutationOptions());

	const blocked = me.textBlock !== null;
	const textsOn = me.textsOn && !blocked;
	const textsHint = !me.textablePhone
		? "Add a US mobile number above to get texts."
		: me.textBlock === "stop"
			? `You replied STOP from this phone. Text START to ${me.textingFrom} to turn texts back on.`
			: blocked
				? "Carriers say this number can't get texts."
				: textsOn
					? "On. Below says which messages come this way."
					: "Off. Invitations still show up on the site.";

	// A channel is offered only if it can work; the one already chosen stays
	// on the list so the picker never shows nothing selected.
	const contactBy: Channel = me.contactBy ?? (emailOn ? "email" : "text");
	const canUse = (c: Channel) =>
		c === contactBy ||
		(c === "email" ? emailOn : c === "text" ? textsOn : emailOn && textsOn);
	const channels = (["email", "text", "both"] as const).filter(canUse);
	const isHost = canHost(me);
	const alertsBy = me.alertsBy ?? "same";

	return (
		<Panel className="gap-1">
			<h2 className="m-0 mb-2 text-[20px]">How we reach you</h2>
			{/* Somebody invited on paper by name alone has no email to switch. */}
			{me.email ? (
				<SettingRow
					title="Email"
					hint={
						emailOn
							? "Invitations, reminders and changes land in your inbox."
							: `${me.unsubscribeReason ? REASON[me.unsubscribeReason] : "Off."} Invitations still show up on the site.`
					}
				>
					<Switch
						label="Invitations by email"
						checked={emailOn}
						onChange={(value) => setEmail.mutate({ on: value })}
					/>
				</SettingRow>
			) : null}
			<SettingRow
				title={
					me.phone && me.textablePhone
						? `Texts to ${formatPhone(me.phone)}`
						: "Texts"
				}
				hint={textsHint}
			>
				<Switch
					label="Invitations by text"
					checked={textsOn}
					disabled={!me.textablePhone || blocked || setTexts.isPending}
					onChange={(value) => setTexts.mutate({ on: value })}
				/>
			</SettingRow>
			{channels.length > 1 ? (
				<SettingRow
					title="Invitations and reminders by"
					hint={
						me.contactBy === null ? "Our pick for you, for now." : undefined
					}
				>
					<div className="w-full sm:w-auto sm:min-w-[260px]">
						<Segmented
							legend="Invitations and reminders by"
							name="contact-by"
							options={channels.map((c) => ({
								value: c,
								label: CHANNEL_LABEL[c],
							}))}
							value={contactBy}
							onChange={(value) => setPrefs.mutate({ contactBy: value })}
							disabled={setPrefs.isPending}
						/>
					</div>
				</SettingRow>
			) : null}
			{isHost ? (
				<SettingRow
					title="Reply alerts by"
					hint="When a guest answers an event you host. Same follows your choice above."
				>
					<div className="w-full sm:w-auto sm:min-w-[340px]">
						<Segmented
							legend="Reply alerts by"
							name="alerts-by"
							options={[
								{ value: "same", label: "Same" },
								...(["email", "text", "both"] as const).map((c) => ({
									value: c,
									label: CHANNEL_LABEL[c],
								})),
							]}
							value={alertsBy}
							onChange={(value) =>
								setPrefs.mutate({ alertsBy: value === "same" ? null : value })
							}
							disabled={setPrefs.isPending}
						/>
					</div>
				</SettingRow>
			) : null}
			<p className="m-0 border-line border-t pt-3.5 text-[12px] text-haze">
				Texts come from {me.textingFrom}. Message and data rates may apply.
				Reply STOP to stop, HELP for help. See our <a href="/terms">terms</a>{" "}
				and <a href="/privacy">privacy policy</a>.
			</p>
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
