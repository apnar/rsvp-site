import { formatPhone } from "@rsvp-site/db/phone";
import type { Role } from "@rsvp-site/db/roles";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { cn } from "@rsvp-site/ui/lib/utils";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { DeletePerson } from "@/components/admin/delete-person";
import { EditPerson } from "@/components/admin/edit-person";
import { usePersonActions } from "@/components/admin/use-person-actions";
import { Avatar } from "@/components/brand";
import { ConfirmAction } from "@/components/confirm-action";
import { Field } from "@/components/controls";
import { NativeSelect } from "@/components/native-select";
import { Panel } from "@/components/page";
import { PillTabs } from "@/components/pill-tabs";
import { DRY_RUN_SUFFIX, pageTitle } from "@/content/site";
import type { Outputs } from "@/lib/api-types";
import { initials, matchesPerson, shortDate } from "@/lib/format";
import { orpc } from "@/utils/orpc";

const SHOWS = ["user", "host", "admin", "off"] as const;

const peopleQuery = () => orpc.people.list.queryOptions();

export const Route = createFileRoute("/_admin/admin/users")({
	// The tab is in the URL so Back and a refresh keep it; "all" is the
	// absence of it.
	validateSearch: z.object({
		show: z.enum(SHOWS).optional().catch(undefined),
	}),
	loader: ({ context }) => context.queryClient.ensureQueryData(peopleQuery()),
	head: () => ({ meta: [{ title: pageTitle("People") }] }),
	component: AdminPeoplePage,
});

type Person = Outputs["people"]["list"][number];

const ROLE_OPTIONS: { value: Role; label: string }[] = [
	{ value: "user", label: "Guest" },
	{ value: "host", label: "Host" },
	{ value: "admin", label: "Admin" },
];

/** A select's value as the role it names, or nothing for anything else. */
const roleFrom = (value: string): Role | undefined =>
	ROLE_OPTIONS.find((o) => o.value === value)?.value;

/** Everybody on the site: add them, set what they may do, or shut them out. */
function AdminPeoplePage() {
	const { session } = Route.useRouteContext();
	const { data: people } = useSuspenseQuery(peopleQuery());
	const { show = "all" } = Route.useSearch();
	const navigate = Route.useNavigate();
	const [query, setQuery] = useState("");

	const shown = useMemo(() => {
		return people.filter((p) => {
			if (
				show === "off"
					? p.status !== "deactivated"
					: show !== "all" && p.role !== show
			) {
				return false;
			}
			return matchesPerson(p, query);
		});
	}, [people, query, show]);
	const count = (role: Role) => people.filter((p) => p.role === role).length;

	return (
		<div className="flex flex-col gap-7">
			<AddPerson />
			<section className="flex flex-col gap-3.5">
				<div className="flex flex-wrap items-center gap-2.5">
					<PillTabs
						label="Show"
						value={show}
						onChange={(next) =>
							navigate({
								search: (prev) => ({
									...prev,
									show: next === "all" ? undefined : next,
								}),
							})
						}
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
						<PersonRow key={p.id} person={p} isYou={p.id === session.user.id} />
					))}
				</div>
			</section>
		</div>
	);
}

function AddPerson() {
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
			},
		}),
	);
	return (
		<Panel
			title="Add somebody"
			as="form"
			onSubmit={(e) => {
				e.preventDefault();
				add.mutate({ email, name: name || undefined, role });
			}}
		>
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
						onChange={(e) => setRole(roleFrom(e.target.value) ?? role)}
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

function PersonRow({ person: p, isYou }: { person: Person; isYou: boolean }) {
	const { setRole, sendLink, newLink, deactivate, reactivate } =
		usePersonActions();
	const [editing, setEditing] = useState(false);
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
				image={p.image}
				tone={isYou ? "pink" : off ? "dim" : "plain"}
			/>
			<div className="min-w-0 flex-[1_1_220px]">
				<b className="text-[17px]">{p.name}</b>
				<div className="truncate text-[13px] text-haze">
					{p.email}
					{isYou ? " · you" : ""}
				</div>
				{p.phone ? (
					<div className="truncate text-[13px] text-haze">
						{formatPhone(p.phone)} ·{" "}
						{p.textsOffAt
							? "texts off"
							: p.textsOkAt
								? "texts on"
								: "texts not agreed"}
					</div>
				) : null}
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
				onChange={(e) => {
					const role = roleFrom(e.target.value);
					if (role) setRole.mutate({ userId: p.id, role });
				}}
			>
				{ROLE_OPTIONS.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</NativeSelect>
			<span className="flex flex-wrap gap-1.5">
				{off ? (
					<>
						<Button
							variant="outline"
							size="sm"
							disabled={reactivate.isPending}
							onClick={() => reactivate.mutate({ userId: p.id })}
						>
							Reactivate
						</Button>
						<DeletePerson person={p} />
					</>
				) : (
					<>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setEditing(true)}
							aria-label={`Edit ${p.name}`}
						>
							Edit
						</Button>
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
								confirm="Replace it"
								pending={newLink.isPending}
								onConfirm={(close) =>
									newLink.mutate({ userId: p.id }, { onSuccess: close })
								}
								trigger={{
									variant: "ghost",
									size: "sm",
									children: "New link",
								}}
							/>
						)}
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
						{isYou ? null : <DeletePerson person={p} />}
					</>
				)}
			</span>
			{editing ? (
				<EditPerson person={p} onClose={() => setEditing(false)} />
			) : null}
		</div>
	);
}
