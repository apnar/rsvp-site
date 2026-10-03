import type { Role } from "@rsvp-site/db/roles";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { cn } from "@rsvp-site/ui/lib/utils";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/brand";
import { ConfirmAction } from "@/components/confirm-action";
import { Field } from "@/components/controls";
import { NativeSelect } from "@/components/native-select";
import { Panel } from "@/components/page";
import { PillTabs } from "@/components/pill-tabs";
import { DRY_RUN_SUFFIX, pageTitle } from "@/content/site";
import type { Outputs } from "@/lib/api-types";
import { initials, shortDate } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_admin/admin/users")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(orpc.people.list.queryOptions()),
	head: () => ({ meta: [{ title: pageTitle("People") }] }),
	component: AdminPeoplePage,
});

type Person = Outputs["people"]["list"][number];

const ROLE_OPTIONS: { value: Role; label: string }[] = [
	{ value: "user", label: "Guest" },
	{ value: "host", label: "Host" },
	{ value: "admin", label: "Admin" },
];

/** Everybody on the site: add them, set what they may do, or shut them out. */
function AdminPeoplePage() {
	const queryClient = useQueryClient();
	const { session } = Route.useRouteContext();
	const { data: people } = useSuspenseQuery(orpc.people.list.queryOptions());
	const [query, setQuery] = useState("");
	const [show, setShow] = useState<"all" | Role | "off">("all");
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: orpc.people.key() });

	const shown = useMemo(() => {
		const q = query.trim().toLowerCase();
		return people.filter((p) => {
			if (
				show === "off"
					? p.status !== "deactivated"
					: show !== "all" && p.role !== show
			) {
				return false;
			}
			return !q || p.name.toLowerCase().includes(q) || p.email.includes(q);
		});
	}, [people, query, show]);
	const count = (role: Role) => people.filter((p) => p.role === role).length;

	return (
		<div className="flex flex-col gap-7">
			<AddPerson onAdded={refresh} />
			<section className="flex flex-col gap-3.5">
				<div className="flex flex-wrap items-center gap-2.5">
					<PillTabs
						label="Show"
						value={show}
						onChange={setShow}
						options={[
							{ value: "all", label: "All", count: people.length },
							{ value: "user", label: "Guests", count: count("user") },
							{ value: "host", label: "Hosts", count: count("host") },
							{ value: "admin", label: "Admins", count: count("admin") },
							{
								value: "off",
								label: "Deactivated",
								count: people.filter((p) => p.status === "deactivated").length,
							},
						]}
					/>
					<label htmlFor="find-person" className="sr-only">
						Find somebody
					</label>
					<Input
						id="find-person"
						type="search"
						placeholder="Find somebody"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						className="min-h-11 flex-[1_1_200px] rounded-full py-2.5"
					/>
				</div>
				<div className="flex flex-col gap-2">
					{shown.map((p) => (
						<PersonRow
							key={p.id}
							person={p}
							isYou={p.id === session.user.id}
							onChange={refresh}
						/>
					))}
				</div>
			</section>
		</div>
	);
}

function AddPerson({ onAdded }: { onAdded: () => void }) {
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [role, setRole] = useState<Role>("host");
	const add = useMutation(
		orpc.people.add.mutationOptions({
			onSuccess: (r) => {
				toast.success(
					`${r.created ? "Added" : "Updated"} and sent their link.${r.dryRun ? DRY_RUN_SUFFIX : ""}`,
				);
				setEmail("");
				setName("");
				onAdded();
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);
	return (
		<Panel
			as="form"
			onSubmit={(e) => {
				e.preventDefault();
				add.mutate({ email, name: name || undefined, role });
			}}
		>
			<h2 className="m-0 text-[20px]">Add somebody</h2>
			<p className="m-0 text-[14px] text-haze">
				They get an email with their sign-in link. Hosts add guests themselves
				by inviting them; this is for making hosts and admins, or sending
				somebody their way in.
			</p>
			<div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] items-end gap-3">
				<Field label="Email" htmlFor="new-email">
					<Input
						id="new-email"
						type="email"
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>
				</Field>
				<Field label="Name (optional)" htmlFor="new-name">
					<Input
						id="new-name"
						value={name}
						maxLength={60}
						onChange={(e) => setName(e.target.value)}
					/>
				</Field>
				<Field label="Role" htmlFor="new-role">
					<NativeSelect
						id="new-role"
						value={role}
						onChange={(e) => setRole(e.target.value as Role)}
						className="min-h-12 rounded-[14px] px-4"
					>
						{ROLE_OPTIONS.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</NativeSelect>
				</Field>
			</div>
			<Button type="submit" className="self-start" disabled={add.isPending}>
				Add and send their link
			</Button>
		</Panel>
	);
}

function PersonRow({
	person: p,
	isYou,
	onChange,
}: {
	person: Person;
	isYou: boolean;
	onChange: () => void;
}) {
	const onError = (error: Error) => toast.error(error.message);
	const setRole = useMutation(
		orpc.people.setRole.mutationOptions({
			onSuccess: () => {
				toast.success(
					"Role changed. It can take a few minutes to show for them.",
				);
				onChange();
			},
			onError,
		}),
	);
	const sendLink = useMutation(
		orpc.people.sendLink.mutationOptions({
			onSuccess: (r) => {
				toast.success(`Link sent.${r.dryRun ? DRY_RUN_SUFFIX : ""}`);
				onChange();
			},
			onError,
		}),
	);
	const deactivate = useMutation(
		orpc.people.deactivate.mutationOptions({
			onSuccess: () => {
				onChange();
			},
			onError,
		}),
	);
	const reactivate = useMutation(
		orpc.people.reactivate.mutationOptions({ onSuccess: onChange, onError }),
	);
	const off = p.status === "deactivated";

	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-x-5 gap-y-2.5 rounded-[20px] px-5 py-4",
				off ? "bg-panel-dim text-haze" : "bg-panel",
			)}
		>
			<Avatar
				initials={initials(p.name)}
				tone={isYou ? "pink" : off ? "dim" : "plain"}
			/>
			<div className="min-w-0 flex-[1_1_220px]">
				<b className="text-[17px]">{p.name}</b>
				<div className="truncate text-[13px] text-haze">
					{p.email}
					{isYou ? " · you" : ""}
				</div>
			</div>
			<span className="flex-[0_0_150px] text-[13px] text-soft">
				Hosting {p.hosting} · invited {p.invited}
			</span>
			<span className="flex-[0_0_140px] text-[13px] text-haze">
				{off
					? "Deactivated"
					: p.unsubscribedAt
						? `No email (${p.unsubscribeReason ?? "off"})`
						: p.linkSentAt
							? `Link sent ${shortDate(p.linkSentAt)}`
							: `Since ${shortDate(p.createdAt)}`}
			</span>
			<label htmlFor={`role-${p.id}`} className="sr-only">
				Role for {p.name}
			</label>
			<NativeSelect
				id={`role-${p.id}`}
				value={p.role}
				disabled={isYou || off || setRole.isPending}
				onChange={(e) =>
					setRole.mutate({ userId: p.id, role: e.target.value as Role })
				}
			>
				{ROLE_OPTIONS.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</NativeSelect>
			<span className="flex flex-wrap gap-1.5">
				{off ? (
					<Button
						variant="outline"
						size="sm"
						disabled={reactivate.isPending}
						onClick={() => reactivate.mutate({ userId: p.id })}
					>
						Reactivate
					</Button>
				) : (
					<>
						<Button
							variant="ghost"
							size="sm"
							disabled={sendLink.isPending}
							onClick={() => sendLink.mutate({ userId: p.id })}
						>
							Send link
						</Button>
						{isYou ? null : (
							<ConfirmAction
								confirm="Shut them out"
								pending={deactivate.isPending}
								onConfirm={(close) =>
									deactivate.mutate({ userId: p.id }, { onSuccess: close })
								}
								trigger={{
									variant: "ghost",
									size: "sm",
									children: "Deactivate",
								}}
							/>
						)}
					</>
				)}
			</span>
		</div>
	);
}
