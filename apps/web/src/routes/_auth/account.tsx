import type { DietId } from "@rsvp-site/db/diets";
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
import { useState } from "react";
import { toast } from "sonner";
import { AvatarField } from "@/components/avatar/avatar-field";
import { ConfirmAction } from "@/components/confirm-action";
import { Field } from "@/components/controls";
import { DietFields, DietSummaryRow } from "@/components/diet";
import { Page, PageHead, Panel } from "@/components/page";
import { DetailFields } from "@/components/person-details";
import { ReachFields } from "@/components/reach-fields";
import { TextsDisclosure } from "@/components/texts-copy";
import { pageTitle } from "@/content/site";
import { authClient } from "@/lib/auth-client";
import { changedDetails, draftOf } from "@/lib/details-draft";
import { type DietValue, sameDiet } from "@/lib/diet-value";
import { type Reach, reachPatch, savedReach } from "@/lib/reach-draft";
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
	return (
		<Panel
			title="You"
			as="form"
			onSubmit={(e) => {
				e.preventDefault();
				save.mutate(patch);
			}}
		>
			<AvatarField
				name={me.name}
				image={me.image}
				mine
				pending={setPicture.isPending || removePicture.isPending}
				onSave={(file) => setPicture.mutateAsync({ file })}
				onRemove={() => removePicture.mutateAsync({})}
			/>
			<DetailFields
				idPrefix="me"
				draft={draft}
				onChange={(k, v) => setDraft((d) => ({ ...d, [k]: v }))}
				autoComplete="profile"
				email={
					<Field label="Email" htmlFor="email">
						<Input
							id="email"
							value={me.email || "No email on file"}
							readOnly
							disabled
						/>
					</Field>
				}
			/>
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
	const { data: me } = useSuspenseQuery(meQuery());
	const { data: family } = useSuspenseQuery(familyQuery());
	const saved: DietValue = { diets: me.diets, note: me.dietNote };
	const [draft, setDraft] = useState(saved);
	const save = useMutation(
		orpc.account.setDetails.mutationOptions({
			onSuccess: () => toast.success("Saved."),
		}),
	);
	return (
		<>
			<Panel
				title="Dietary needs"
				as="form"
				onSubmit={(e) => {
					e.preventDefault();
					save.mutate({ diets: draft.diets, dietNote: draft.note });
				}}
			>
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
				<Panel title="Your family's">
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
			<DietSummaryRow
				name={r.name}
				child={r.child}
				value={saved}
				quiet
				onChange={
					open
						? undefined
						: () => {
								setDraft(saved);
								setOpen(true);
							}
				}
			/>
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

/** Like every other panel here, changes wait for Save. */
function ReachPrefs() {
	const { data: me } = useSuspenseQuery(meQuery());
	const saved = savedReach(me);
	// Only what was touched, laid over what's saved, so a refetch shows
	// through everything else and a Save clears it.
	const [edits, setEdits] = useState<Partial<Reach>>({});
	const draft: Reach = { ...saved, ...edits };
	const patch = reachPatch(saved, edits);
	const save = useMutation(
		orpc.account.setReach.mutationOptions({
			onSuccess: () => {
				setEdits({});
				toast.success("Saved.");
			},
		}),
	);

	return (
		<Panel
			className="gap-1"
			as="form"
			onSubmit={(e) => {
				e.preventDefault();
				save.mutate(patch);
			}}
		>
			<h2 className="m-0 mb-2 text-[20px]">How we reach you</h2>
			<ReachFields
				mine
				saved={saved}
				draft={draft}
				onEdit={(change) => setEdits((e) => ({ ...e, ...change }))}
				person={me}
				isHost={canHost(me)}
				textingFrom={me.textingFrom}
			/>
			<p className="m-0 border-line border-t pt-3.5 text-[12px] text-haze">
				Texts come from {me.textingFrom}. <TextsDisclosure />
			</p>
			<Button
				type="submit"
				className="mt-3 self-start"
				disabled={save.isPending || Object.keys(patch).length === 0}
			>
				Save
			</Button>
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
		<Panel title="Password" as="form" onSubmit={submit}>
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
		<Panel title="Sign out everywhere" className="gap-3">
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
