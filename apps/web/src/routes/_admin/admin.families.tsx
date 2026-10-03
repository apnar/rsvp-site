import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { Textarea } from "@rsvp-site/ui/components/textarea";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/confirm-action";
import { Switch } from "@/components/controls";
import { Panel } from "@/components/page";
import { pageTitle } from "@/content/site";
import type { Outputs } from "@/lib/api-types";
import { matchesPerson, plural } from "@/lib/format";
import { orpc } from "@/utils/orpc";

const familiesQuery = () => orpc.families.list.queryOptions();
const peopleQuery = () => orpc.people.list.queryOptions();

export const Route = createFileRoute("/_admin/admin/families")({
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(familiesQuery()),
			context.queryClient.ensureQueryData(peopleQuery()),
		]),
	head: () => ({ meta: [{ title: pageTitle("Families") }] }),
	component: AdminFamiliesPage,
});

type Family = Outputs["families"]["list"][number];

/** Households, kept here and nowhere else. */
function AdminFamiliesPage() {
	const { data: families } = useSuspenseQuery(familiesQuery());
	return (
		<div className="flex flex-col gap-7">
			<Panel>
				<h2 className="m-0 text-[20px]">Families</h2>
				<p className="m-0 text-[14px] text-haze">
					A family is a household. Anybody in one may answer for the relatives
					who are on the same invitation list, and a child they answer for
					counts as a kid. A person is in one family at most. Shared families
					show up in every host's guest picker; the rest are for you to keep.
					Only admins (and the person) edit a family member's details; hosts who
					add them can't.
				</p>
			</Panel>
			<CreateFamily />
			<div className="flex flex-col gap-4">
				{families.map((f) => (
					<FamilyPanel key={f.id} family={f} families={families} />
				))}
			</div>
		</div>
	);
}

function CreateFamily() {
	const [name, setName] = useState("");
	const [shared, setShared] = useState(true);
	const create = useMutation(
		orpc.families.create.mutationOptions({
			onSuccess: () => {
				toast.success("Made the family. Add its people below.");
				setName("");
			},
		}),
	);
	return (
		<Panel
			as="form"
			onSubmit={(e) => {
				e.preventDefault();
				create.mutate({ name, shared });
			}}
		>
			<h2 className="m-0 text-[20px]">Make a family</h2>
			<div className="flex flex-wrap items-center gap-3">
				<label htmlFor="family-name" className="sr-only">
					New family name
				</label>
				<Input
					id="family-name"
					value={name}
					maxLength={80}
					placeholder="e.g. The Nguyens"
					onChange={(e) => setName(e.target.value)}
					className="min-h-11 min-w-0 flex-[1_1_200px] rounded-full py-2.5"
				/>
				<span className="flex items-center gap-2 text-[14px] text-soft">
					<Switch checked={shared} onChange={setShared} label="Shared" />
					Shared with hosts
				</span>
				<Button type="submit" disabled={create.isPending || !name.trim()}>
					Make it
				</Button>
			</div>
		</Panel>
	);
}

function FamilyPanel({
	family,
	families,
}: {
	family: Family;
	families: Family[];
}) {
	const [name, setName] = useState(family.name);
	const rename = useMutation(orpc.families.rename.mutationOptions());
	const setShared = useMutation(orpc.families.setShared.mutationOptions());
	const remove = useMutation(orpc.families.remove.mutationOptions());
	const setChild = useMutation(orpc.families.setChild.mutationOptions());
	const removeMember = useMutation(
		orpc.families.removeMember.mutationOptions(),
	);
	return (
		<Panel>
			<div className="flex flex-wrap items-center gap-3">
				<label htmlFor={`family-${family.id}`} className="sr-only">
					Name of the family {family.name}
				</label>
				<Input
					id={`family-${family.id}`}
					value={name}
					maxLength={80}
					onChange={(e) => setName(e.target.value)}
					onBlur={() => {
						if (name.trim() && name !== family.name) {
							rename.mutate({ familyId: family.id, name });
						}
					}}
					className="min-h-9 min-w-0 flex-1 border-transparent bg-transparent px-0 font-bold text-[20px] hover:border-transparent focus-visible:border-line-strong focus-visible:px-3"
				/>
				<span className="flex items-center gap-2 text-[14px] text-soft">
					<Switch
						checked={family.shared}
						disabled={setShared.isPending}
						onChange={(shared) =>
							setShared.mutate({ familyId: family.id, shared })
						}
						label={`Share ${family.name} with hosts`}
					/>
					Shared
				</span>
				<ConfirmAction
					size="xs"
					confirm="Delete"
					pending={remove.isPending}
					onConfirm={() => remove.mutate({ familyId: family.id })}
					trigger={{
						variant: "ghost",
						size: "icon-xs",
						"aria-label": `Delete the family ${family.name}`,
						className: "text-haze",
						children: "×",
					}}
				/>
			</div>
			{family.members.length === 0 ? (
				<p className="m-0 text-[14px] text-haze">Nobody yet.</p>
			) : (
				<ul className="m-0 flex list-none flex-col p-0">
					{family.members.map((m) => (
						<li
							key={m.id}
							className="flex flex-wrap items-center gap-3 border-line border-t py-2"
						>
							<span className="min-w-0 flex-[1_1_200px]">
								<b className="text-[15px]">{m.name}</b>
								<span className="block truncate text-[13px] text-haze">
									{m.noEmail ? "No email" : m.email}
								</span>
							</span>
							<span className="flex items-center gap-2 text-[14px] text-soft">
								<Switch
									checked={m.child}
									onChange={(child) =>
										setChild.mutate({
											familyId: family.id,
											userId: m.id,
											child,
										})
									}
									label={`${m.name} is a child`}
								/>
								Child
							</span>
							<ConfirmAction
								size="xs"
								confirm="Remove"
								pending={removeMember.isPending}
								onConfirm={() =>
									removeMember.mutate({ familyId: family.id, userId: m.id })
								}
								trigger={{
									variant: "ghost",
									size: "icon-xs",
									"aria-label": `Take ${m.name} out of ${family.name}`,
									className: "text-haze",
									children: "×",
								}}
							/>
						</li>
					))}
				</ul>
			)}
			<AddMembers family={family} families={families} />
		</Panel>
	);
}

/** Toasts what an add did, naming anybody it left where they were. */
function reportAdd(r: Outputs["families"]["addMembers"]) {
	if (r.invalid) toast.error("No addresses or names found in that.");
	else if (r.added > 0)
		toast.success(`Added ${plural(r.added, "person", "people")}.`);
	for (const e of r.elsewhere) {
		toast.error(`${e.name}: already in the ${e.familyName} family.`, {
			description: "Take them out of that one first to move them.",
		});
	}
}

function AddMembers({
	family,
	families,
}: {
	family: Family;
	families: Family[];
}) {
	const { data: people } = useSuspenseQuery(peopleQuery());
	const [query, setQuery] = useState("");
	const [lines, setLines] = useState("");
	const [child, setChild] = useState(false);
	// One family per person, so anybody already in one is shown with its name
	// instead of an add button that could only fail.
	const familyOf = useMemo(
		() =>
			new Map(
				families.flatMap((f) => f.members.map((m) => [m.id, f.name] as const)),
			),
		[families],
	);
	const found = useMemo(
		() =>
			query.trim()
				? people
						.filter(
							(p) => p.status !== "deactivated" && matchesPerson(p, query),
						)
						.slice(0, 8)
				: [],
		[people, query],
	);
	const add = useMutation(
		orpc.families.addMembers.mutationOptions({ onSuccess: reportAdd }),
	);
	const addTyped = useMutation(
		orpc.families.addMembers.mutationOptions({
			onSuccess: (r) => {
				reportAdd(r);
				if (!r.invalid) setLines("");
			},
		}),
	);
	return (
		<div className="flex flex-col gap-3 border-line border-t pt-4">
			<label htmlFor={`find-${family.id}`} className="text-[13px] text-haze">
				Add somebody who is already on the site
			</label>
			<Input
				id={`find-${family.id}`}
				type="search"
				placeholder="Find somebody"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				className="min-h-11 rounded-full py-2.5"
			/>
			{found.map((p) => {
				const elsewhere = familyOf.get(p.id);
				return (
					<div key={p.id} className="flex items-center gap-3 text-[14px]">
						<span className="min-w-0 flex-1">
							<b>{p.name}</b> <span className="text-haze">{p.email}</span>
						</span>
						{elsewhere ? (
							<span className="text-haze">
								Already in the {elsewhere} family
							</span>
						) : (
							<Button
								size="sm"
								variant="outline"
								disabled={add.isPending}
								onClick={() =>
									add.mutate({ familyId: family.id, userIds: [p.id], child })
								}
							>
								Add
							</Button>
						)}
					</div>
				);
			})}
			<form
				className="flex flex-col gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					addTyped.mutate({ familyId: family.id, lines, child });
				}}
			>
				<label htmlFor={`lines-${family.id}`} className="text-[13px] text-haze">
					Or paste addresses or names, one per line. A name alone is somebody
					with no email, like a small child.
				</label>
				<Textarea
					id={`lines-${family.id}`}
					rows={3}
					value={lines}
					onChange={(e) => setLines(e.target.value)}
				/>
				<div className="flex flex-wrap items-center gap-3">
					<span className="flex items-center gap-2 text-[14px] text-soft">
						<Switch
							checked={child}
							onChange={setChild}
							label="The people being added are children"
						/>
						These are children
					</span>
					<Button
						type="submit"
						size="sm"
						disabled={addTyped.isPending || !lines.trim()}
					>
						Add them
					</Button>
				</div>
			</form>
		</div>
	);
}
