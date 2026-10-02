import { Blueprint } from "@rsvp-site/ui/components/blueprint";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { Label } from "@rsvp-site/ui/components/label";
import { Textarea } from "@rsvp-site/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_admin/admin/gyms")({
	component: AdminGymsPage,
});

type FormState = { name: string; address: string; notes: string };

const emptyForm: FormState = { name: "", address: "", notes: "" };

function when(value: Date | string | null | undefined): string {
	if (!value) return "Never";
	return new Date(value).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

/**
 * The venues, and everything about them that used to be retyped into every
 * booking or lost in somebody's texts: the address, and which door is open.
 */
function AdminGymsPage() {
	const queryClient = useQueryClient();
	const gyms = useQuery(orpc.gyms.list.queryOptions());
	const [form, setForm] = useState<FormState>(emptyForm);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [confirmId, setConfirmId] = useState<string | null>(null);

	const onError = (error: Error) => toast.error(error.message);
	const refresh = () => {
		// Games and permits both name gyms, so their caches go stale too.
		queryClient.invalidateQueries({ queryKey: orpc.gyms.key() });
		queryClient.invalidateQueries({ queryKey: orpc.games.key() });
		queryClient.invalidateQueries({ queryKey: orpc.permits.key() });
		queryClient.invalidateQueries({ queryKey: orpc.rsvp.key() });
	};
	const reset = () => {
		setForm(emptyForm);
		setEditingId(null);
	};

	const create = useMutation(
		orpc.gyms.create.mutationOptions({
			onSuccess: () => {
				toast.success("Venue added.");
				reset();
				refresh();
			},
			onError,
		}),
	);
	const update = useMutation(
		orpc.gyms.update.mutationOptions({
			onSuccess: () => {
				toast.success("Venue updated.");
				reset();
				refresh();
			},
			onError,
		}),
	);
	const remove = useMutation(
		orpc.gyms.remove.mutationOptions({
			onSuccess: () => {
				toast.success("Venue removed.");
				setConfirmId(null);
				refresh();
			},
			onError,
		}),
	);

	const set = (key: keyof FormState) => (value: string) =>
		setForm((f) => ({ ...f, [key]: value }));

	const submit = (e: React.FormEvent) => {
		e.preventDefault();
		const payload = {
			name: form.name,
			address: form.address,
			notes: form.notes || null,
		};
		if (editingId) {
			update.mutate({ id: editingId, ...payload });
		} else {
			create.mutate(payload);
		}
	};

	const rows = gyms.data ?? [];
	const busy = create.isPending || update.isPending;

	return (
		<div className="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
			<Blueprint className="h-fit p-6">
				<span className="kicker mb-3 block text-steel-700">
					{editingId ? "Edit venue" : "Add a venue"}
				</span>
				<form onSubmit={submit} className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="name">Name</Label>
						<Input
							id="name"
							required
							maxLength={80}
							placeholder="The Garden Room"
							value={form.name}
							onChange={(e) => set("name")(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="address">Address</Label>
						<Input
							id="address"
							required
							maxLength={200}
							placeholder="123 Main St, Springfield, MD 20800"
							value={form.address}
							onChange={(e) => set("address")(e.target.value)}
						/>
						<p className="text-[13px] text-neutral-700 leading-5">
							The whole thing. It goes in the emails people read in the car.
						</p>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="notes">Notes (optional)</Label>
						<Textarea
							id="notes"
							maxLength={500}
							placeholder="Park by the side door. The main entrance is locked after 9."
							value={form.notes}
							onChange={(e) => set("notes")(e.target.value)}
						/>
						<p className="text-[13px] text-neutral-700 leading-5">
							Parking, which door, who to ask for. Shown with every event here.
						</p>
					</div>
					<div className="flex gap-2.5">
						<Button type="submit" disabled={busy}>
							{editingId ? "Save changes" : "Add it"}
						</Button>
						{editingId ? (
							<Button type="button" variant="ghost" onClick={reset}>
								Cancel
							</Button>
						) : null}
					</div>
				</form>
			</Blueprint>

			<div>
				<span className="kicker mb-3 block text-steel-700">The venues</span>
				{rows.length === 0 ? (
					<p className="text-[15px] text-neutral-700 leading-6">
						No venues yet. Add one and you can book an event at it.
					</p>
				) : (
					<ul className="space-y-4">
						{rows.map((g) => (
							<li key={g.id}>
								<Blueprint className="p-4">
									<div className="flex flex-wrap items-start gap-x-6 gap-y-2">
										<div className="min-w-0 flex-1">
											<span className="block font-heading font-semibold text-xl uppercase leading-6 tracking-[0.02em]">
												{g.name}
											</span>
											{g.address ? (
												<span className="block text-[13px] text-neutral-700 leading-5">
													{g.address}
												</span>
											) : (
												<span className="mt-1 inline-flex items-center bg-amber-100 px-2.5 py-[3px] text-[11px] text-amber-900 tracking-[0.02em]">
													No address on file
												</span>
											)}
											{g.notes ? (
												<p className="mt-1.5 max-w-[52ch] text-[13px] text-ink leading-5">
													{g.notes}
												</p>
											) : null}
										</div>
										<div className="flex gap-2">
											<Button
												variant="ghost"
												size="xs"
												onClick={() => {
													setEditingId(g.id);
													setForm({
														name: g.name,
														address: g.address,
														notes: g.notes ?? "",
													});
												}}
											>
												Edit
											</Button>
											<Button
												variant={confirmId === g.id ? "destructive" : "ghost"}
												size="xs"
												disabled={remove.isPending}
												onClick={() => {
													if (confirmId === g.id) {
														remove.mutate({ id: g.id });
													} else {
														setConfirmId(g.id);
													}
												}}
											>
												{confirmId === g.id ? "Really delete" : "Delete"}
											</Button>
										</div>
									</div>
									<div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-divider border-t pt-2.5 text-[13px] text-neutral-700">
										<span className="tnum">
											{g.gameCount} {g.gameCount === 1 ? "event" : "events"}
										</span>
										<span>Last booked: {when(g.lastBookedAt)}</span>
										<span>
											{g.permits.length === 0
												? "No permit covers it"
												: `Permits: ${g.permits.map((p) => p.label).join(", ")}`}
										</span>
									</div>
								</Blueprint>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
