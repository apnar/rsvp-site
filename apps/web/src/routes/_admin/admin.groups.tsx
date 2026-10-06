import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Switch } from "@/components/controls";
import { Panel } from "@/components/page";
import { pageTitle } from "@/content/site";
import type { Outputs } from "@/lib/api-types";
import { plural } from "@/lib/format";
import { orpc } from "@/utils/orpc";

const groupsQuery = () => orpc.contacts.allGroups.queryOptions();

export const Route = createFileRoute("/_admin/admin/groups")({
	loader: ({ context }) => context.queryClient.ensureQueryData(groupsQuery()),
	head: () => ({ meta: [{ title: pageTitle("Groups") }] }),
	component: AdminGroupsPage,
});

type Data = Outputs["contacts"]["allGroups"];

/** Every host's contact groups, and which hosts each is shared with. */
function AdminGroupsPage() {
	const { data } = useSuspenseQuery(groupsQuery());
	const [query, setQuery] = useState("");
	const shown = useMemo(() => {
		const q = query.trim().toLowerCase();
		return data.groups.filter(
			(g) =>
				!q ||
				g.name.toLowerCase().includes(q) ||
				g.ownerName.toLowerCase().includes(q),
		);
	}, [data.groups, query]);
	return (
		<div className="flex flex-col gap-7">
			<Panel>
				<h2 className="m-0 text-[20px]">Groups</h2>
				<p className="m-0 text-[14px] text-haze">
					Each host keeps their own groups. Share one with a host and they can
					add its members to their events; only its owner (and you) can change
					who is in it.
				</p>
				<label htmlFor="find-group" className="sr-only">
					Find a group or its owner
				</label>
				<Input
					id="find-group"
					type="search"
					placeholder="Find a group or its owner"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className="min-h-11 rounded-full py-2.5"
				/>
			</Panel>
			<div className="flex flex-col gap-2">
				{shown.length === 0 ? (
					<p className="m-0 text-[14px] text-haze">No groups.</p>
				) : null}
				{shown.map((g) => (
					<GroupRow key={g.id} group={g} hosts={data.hosts} />
				))}
			</div>
		</div>
	);
}

/**
 * One group: who owns it, who it is shared with, and, opened, a switch for
 * each host who could have it. The owner is left out; it is already theirs.
 */
function GroupRow({
	group: g,
	hosts,
}: {
	group: Data["groups"][number];
	hosts: Data["hosts"];
}) {
	const [open, setOpen] = useState(false);
	const setShare = useMutation(orpc.contacts.setShare.mutationOptions());
	const others = hosts.filter((h) => h.id !== g.ownerId);
	const shared = new Set(g.sharedWith);
	const names = others.filter((h) => shared.has(h.id)).map((h) => h.name);
	return (
		<div className="flex flex-wrap items-center gap-3 rounded-[20px] bg-panel px-5 py-4">
			<span className="min-w-0 flex-[1_1_200px]">
				<b className="text-[17px]">{g.name}</b>
				<span className="block truncate text-[13px] text-haze">
					{g.ownerName} · {plural(g.count, "person", "people")}
				</span>
			</span>
			<span className="min-w-0 flex-[1_1_200px] text-[13px] text-soft">
				{names.length === 0
					? "Not shared"
					: names.length === others.length
						? "Shared with every host"
						: `Shared with ${names.join(", ")}`}
			</span>
			<Button
				variant="outline"
				size="sm"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
			>
				{open ? "Done" : "Share"}
			</Button>
			{open ? (
				<div className="flex basis-full flex-col gap-1 border-line border-t pt-3">
					{others.length === 0 ? (
						<p className="m-0 text-[14px] text-haze">
							Nobody else can host yet.
						</p>
					) : null}
					{others.map((h) => (
						<Switch
							key={h.id}
							checked={shared.has(h.id)}
							disabled={setShare.isPending}
							onChange={(on) =>
								setShare.mutate({
									groupId: g.id,
									userId: h.id,
									shared: on,
								})
							}
							className="w-fit py-1 text-[14px]"
						>
							{h.name}
							<span className="sr-only">: can use {g.name}</span>
						</Switch>
					))}
				</div>
			) : null}
		</div>
	);
}
