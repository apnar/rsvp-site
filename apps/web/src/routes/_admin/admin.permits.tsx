import { Blueprint } from "@rsvp-site/ui/components/blueprint";
import { Button } from "@rsvp-site/ui/components/button";
import { Checkbox } from "@rsvp-site/ui/components/checkbox";
import { Input } from "@rsvp-site/ui/components/input";
import { Label } from "@rsvp-site/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_admin/admin/permits")({
	component: AdminPermitsPage,
});

type Gym = { id: string; name: string };

/**
 * Which venues one piece of paper covers. Checkboxes rather than a
 * `<select multiple>`: one permit covering two venues is common enough
 * that ticking them has to be obvious, and nobody discovers ctrl-click.
 */
function GymChecklist({
	gyms,
	checked,
	onToggle,
	idPrefix,
}: {
	gyms: Gym[];
	checked: Set<string>;
	onToggle: (id: string, next: boolean) => void;
	idPrefix: string;
}) {
	return (
		<div className="flex flex-col gap-2 border border-divider p-3">
			{gyms.map((g) => (
				<div key={g.id} className="flex items-center gap-2.5">
					<Checkbox
						id={`${idPrefix}-${g.id}`}
						checked={checked.has(g.id)}
						onCheckedChange={(next) => onToggle(g.id, next === true)}
					/>
					<Label htmlFor={`${idPrefix}-${g.id}`} className="font-normal">
						{g.name}
					</Label>
				</div>
			))}
		</div>
	);
}

function formatSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AdminPermitsPage() {
	const queryClient = useQueryClient();
	const permits = useQuery(orpc.permits.list.queryOptions());
	const gyms = useQuery(orpc.gyms.list.queryOptions());
	const [label, setLabel] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [gymIds, setGymIds] = useState<Set<string>>(new Set());
	const [confirmId, setConfirmId] = useState<string | null>(null);
	/** Which permit's coverage is open for editing, and what is ticked in it. */
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingGymIds, setEditingGymIds] = useState<Set<string>>(new Set());
	const fileInput = useRef<HTMLInputElement>(null);

	const toggleIn =
		(setter: (update: (prev: Set<string>) => Set<string>) => void) =>
		(id: string, next: boolean) =>
			setter((prev) => {
				const copy = new Set(prev);
				if (next) {
					copy.add(id);
				} else {
					copy.delete(id);
				}
				return copy;
			});

	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: orpc.permits.key() });
		queryClient.invalidateQueries({ queryKey: orpc.games.key() });
		queryClient.invalidateQueries({ queryKey: orpc.rsvp.key() });
		// The Venues tab lists which permits cover each venue.
		queryClient.invalidateQueries({ queryKey: orpc.gyms.key() });
	};
	const onError = (error: Error) => toast.error(error.message);

	const upload = useMutation(
		orpc.permits.upload.mutationOptions({
			onSuccess: () => {
				toast.success("Permit filed.");
				setLabel("");
				setFile(null);
				setGymIds(new Set());
				if (fileInput.current) fileInput.current.value = "";
				refresh();
			},
			onError,
		}),
	);
	const setGyms = useMutation(
		orpc.permits.setGyms.mutationOptions({
			onSuccess: () => {
				toast.success("Coverage updated.");
				setEditingId(null);
				refresh();
			},
			onError,
		}),
	);
	const remove = useMutation(
		orpc.permits.remove.mutationOptions({
			onSuccess: () => {
				toast.success("Permit deleted.");
				setConfirmId(null);
				refresh();
			},
			onError,
		}),
	);

	const gymList = gyms.data ?? [];
	/** Only once we have actually asked: an empty list mid-flight is not news. */
	const noGyms = !gyms.isPending && gymList.length === 0;

	return (
		<div className="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
			<Blueprint className="h-fit p-6">
				<span className="kicker mb-3 block text-steel-700">File a permit</span>
				<form
					className="space-y-4"
					onSubmit={(e) => {
						e.preventDefault();
						if (!file) {
							toast.error("Pick the PDF first.");
							return;
						}
						upload.mutate({ label, file, gymIds: [...gymIds] });
					}}
				>
					<div className="space-y-1.5">
						<Label htmlFor="label">Label</Label>
						<Input
							id="label"
							required
							maxLength={80}
							placeholder="Garden Room, Sep 12 - 26"
							value={label}
							onChange={(e) => setLabel(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="file">PDF</Label>
						<Input
							id="file"
							ref={fileInput}
							type="file"
							accept="application/pdf,.pdf"
							required
							className="file:mr-3 file:border-0 file:bg-transparent file:font-heading file:font-semibold file:text-steel-700"
							onChange={(e) => setFile(e.target.files?.[0] ?? null)}
						/>
						<p className="text-[13px] text-neutral-700 leading-5">
							PDF only, up to 10 MB. Anyone with the link can open it.
						</p>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="gyms">Covers</Label>
						{noGyms ? (
							<p className="text-[15px] text-neutral-700 leading-6">
								No venues yet. <Link to="/admin/gyms">Add one</Link> and you can
								say which venues this permit covers.
							</p>
						) : (
							<>
								<GymChecklist
									gyms={gymList}
									checked={gymIds}
									onToggle={toggleIn(setGymIds)}
									idPrefix="new"
								/>
								<p className="text-[13px] text-neutral-700 leading-5">
									Tick every venue on the paper. One permit can cover several.
								</p>
							</>
						)}
					</div>
					<Button type="submit" disabled={upload.isPending}>
						{upload.isPending ? "Uploading..." : "File it"}
					</Button>
				</form>
			</Blueprint>

			<div>
				<span className="kicker mb-3 block text-steel-700">On file</span>
				{(permits.data ?? []).length === 0 ? (
					<p className="text-[15px] text-neutral-700 leading-6">
						No permits yet. The front desk will notice.
					</p>
				) : (
					<ul className="space-y-4">
						{(permits.data ?? []).map((p) => (
							<li key={p.id}>
								<Blueprint className="flex flex-wrap items-start gap-x-6 gap-y-2 p-4">
									<div className="min-w-0 flex-1">
										<span className="block font-heading font-semibold text-xl uppercase leading-6 tracking-[0.02em]">
											{p.label}
										</span>
										<span className="block text-[13px] text-neutral-700 leading-5">
											{p.fileName} · {formatSize(p.size)}
										</span>
										<span className="block text-[13px] text-neutral-700 leading-5">
											{p.gyms.length === 0
												? "No venues ticked."
												: `Covers: ${p.gyms.map((g) => g.name).join(", ")}`}
										</span>
										<span className="block text-[13px] text-neutral-700 leading-5">
											{p.games.length === 0
												? "Not attached to an event yet."
												: `Events: ${p.games.map((g) => g.dateLabel).join(", ")}`}
										</span>
									</div>
									<div className="flex gap-2">
										<a
											href={`/api/permits/${p.id}/file`}
											target="_blank"
											rel="noreferrer"
											className="kicker text-steel-700 no-underline hover:text-steel-900"
										>
											View
										</a>
										{gymList.length > 0 ? (
											<Button
												variant="ghost"
												size="xs"
												onClick={() => {
													if (editingId === p.id) {
														setEditingId(null);
														return;
													}
													setEditingId(p.id);
													setEditingGymIds(new Set(p.gyms.map((g) => g.id)));
												}}
											>
												{editingId === p.id ? "Close" : "Venues"}
											</Button>
										) : null}
										<Button
											variant={confirmId === p.id ? "destructive" : "ghost"}
											size="xs"
											disabled={remove.isPending}
											onClick={() => {
												if (confirmId === p.id) {
													remove.mutate({ id: p.id });
												} else {
													setConfirmId(p.id);
												}
											}}
										>
											{confirmId === p.id ? "Really delete" : "Delete"}
										</Button>
									</div>
									{editingId === p.id ? (
										<div className="mt-4 w-full border-divider border-t pt-4">
											<span className="kicker mb-2 block text-steel-700">
												Which venues this permit covers
											</span>
											<GymChecklist
												gyms={gymList}
												checked={editingGymIds}
												onToggle={toggleIn(setEditingGymIds)}
												idPrefix={`edit-${p.id}`}
											/>
											<div className="mt-3 flex gap-2.5">
												<Button
													size="sm"
													disabled={setGyms.isPending}
													onClick={() =>
														setGyms.mutate({
															id: p.id,
															gymIds: [...editingGymIds],
														})
													}
												>
													Save coverage
												</Button>
												<Button
													size="sm"
													variant="ghost"
													onClick={() => setEditingId(null)}
												>
													Cancel
												</Button>
											</div>
										</div>
									) : null}
								</Blueprint>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
