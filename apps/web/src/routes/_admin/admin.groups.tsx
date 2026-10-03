import { Input } from "@rsvp-site/ui/components/input";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Switch } from "@/components/controls";
import { Panel } from "@/components/page";
import { pageTitle } from "@/content/site";
import { plural } from "@/lib/format";
import { orpc } from "@/utils/orpc";

const groupsQuery = () => orpc.contacts.allGroups.queryOptions();

export const Route = createFileRoute("/_admin/admin/groups")({
	loader: ({ context }) => context.queryClient.ensureQueryData(groupsQuery()),
	head: () => ({ meta: [{ title: pageTitle("Groups") }] }),
	component: AdminGroupsPage,
});

/** Every host's contact groups, with the switch that hands one to all hosts. */
function AdminGroupsPage() {
	const { data: groups } = useSuspenseQuery(groupsQuery());
	const [query, setQuery] = useState("");
	const setShared = useMutation(orpc.contacts.setShared.mutationOptions());
	const shown = useMemo(() => {
		const q = query.trim().toLowerCase();
		return groups.filter(
			(g) =>
				!q ||
				g.name.toLowerCase().includes(q) ||
				g.ownerName.toLowerCase().includes(q),
		);
	}, [groups, query]);
	return (
		<div className="flex flex-col gap-7">
			<Panel>
				<h2 className="m-0 text-[20px]">Groups</h2>
				<p className="m-0 text-[14px] text-haze">
					Each host keeps their own groups. Share one and every host can add its
					members to their events; only its owner (and you) can change who is in
					it.
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
					<div
						key={g.id}
						className="flex flex-wrap items-center gap-3 rounded-[20px] bg-panel px-5 py-4"
					>
						<span className="min-w-0 flex-[1_1_200px]">
							<b className="text-[17px]">{g.name}</b>
							<span className="block truncate text-[13px] text-haze">
								{g.ownerName} · {plural(g.count, "person", "people")}
							</span>
						</span>
						<span className="flex items-center gap-2 text-[14px] text-soft">
							<Switch
								checked={g.shared}
								disabled={setShared.isPending}
								onChange={(shared) =>
									setShared.mutate({ groupId: g.id, shared })
								}
								label={`Share ${g.name} with every host`}
							/>
							Shared
						</span>
					</div>
				))}
			</div>
		</div>
	);
}
