import { RESPONSE_WINDOW, type ResponseRate } from "@rsvp-site/api/responses";
import { Blueprint } from "@rsvp-site/ui/components/blueprint";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { Label } from "@rsvp-site/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { BreakForm, describeBreak } from "@/components/break-form";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_admin/admin/users")({
	component: AdminPeoplePage,
});

const thClass =
	"border-divider border-b px-2 py-1.5 text-left font-medium text-[11px] text-ink/60 uppercase tracking-[0.08em]";

const chip = (tone: "steel" | "neutral" | "warn" | "gone") =>
	`inline-flex items-center px-2.5 py-[3px] text-[11px] tracking-[0.02em] ${
		tone === "steel"
			? "bg-steel-100 text-steel-800"
			: tone === "warn"
				? "bg-amber-100 text-amber-900"
				: tone === "gone"
					? "bg-neutral-200 text-neutral-700"
					: "bg-neutral-100 text-neutral-800"
	}`;

function when(value: Date | string | null | undefined): string {
	if (!value) return "";
	return new Date(value).toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

/**
 * How somebody has answered the last few calls to play, in the width of a
 * table cell. Three counts over one denominator rather than three fractions:
 * the numbers are all out of the same handful of runs, and repeating "/ 8"
 * three times reads like three different measurements.
 *
 * `of` is how many of those runs this person was on the roster for, so a man
 * added last week reads "of 1" and is not quietly accused of ignoring nine
 * emails that were sent before he existed.
 */
function Record({ rate }: { rate: ResponseRate }) {
	if (rate.of === 0) {
		return <span className="text-neutral-500">Not asked yet</span>;
	}
	return (
		<span className="tnum">
			<strong className="font-semibold text-ink">{rate.yes}</strong> in ·{" "}
			{rate.replied} replied
			{rate.onBreak > 0 ? ` · ${rate.onBreak} away` : ""} ·{" "}
			<span className="text-neutral-500">of {rate.of}</span>
		</span>
	);
}

/**
 * Everybody, in one table. Before this page and the Email tab listed two
 * different tables of people and never mentioned each other; there is only
 * one list now, and this is it.
 */
function AdminPeoplePage() {
	const queryClient = useQueryClient();
	const { session } = Route.useRouteContext();
	const people = useQuery(orpc.people.list.queryOptions());
	const games = useQuery(orpc.games.list.queryOptions());

	const [newEmail, setNewEmail] = useState("");
	const [newName, setNewName] = useState("");
	/** Which row has its break form open, and which has an armed confirm. */
	const [pausing, setPausing] = useState<string | null>(null);
	const [confirmKey, setConfirmKey] = useState<string | null>(null);
	const [reason, setReason] = useState("");

	const onError = (error: Error) => toast.error(error.message);
	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: orpc.people.key() });
		queryClient.invalidateQueries({ queryKey: orpc.mail.key() });
		setPausing(null);
		setConfirmKey(null);
		setReason("");
	};

	const add = useMutation(
		orpc.people.add.mutationOptions({
			onSuccess: (result) => {
				toast.success(
					result.emailed
						? `Added, and their link is ${result.dryRun ? "in the server log" : "on its way"}.`
						: "Added. The welcome email did not go out.",
				);
				setNewEmail("");
				setNewName("");
				refresh();
			},
			onError,
		}),
	);
	const sendLink = useMutation(
		orpc.people.sendLink.mutationOptions({
			onSuccess: (result) => {
				toast.success(
					result.dryRun ? "Link printed to the server log." : "Link sent.",
				);
				refresh();
			},
			onError,
		}),
	);
	const suspend = useMutation(
		orpc.people.suspend.mutationOptions({
			onSuccess: () => {
				toast.success("Spot held.");
				refresh();
			},
			onError,
		}),
	);
	const unsuspend = useMutation(
		orpc.people.unsuspend.mutationOptions({
			onSuccess: () => {
				toast.success("Back on.");
				refresh();
			},
			onError,
		}),
	);
	const deactivate = useMutation(
		orpc.people.deactivate.mutationOptions({
			onSuccess: () => {
				toast.success("Deactivated. Sessions revoked.");
				refresh();
			},
			onError,
		}),
	);
	const reactivate = useMutation(
		orpc.people.reactivate.mutationOptions({
			onSuccess: () => {
				toast.success("Back in. Send them their link.");
				refresh();
			},
			onError,
		}),
	);
	/**
	 * One person swears nothing arrived. Re-send them the stage that has most
	 * recently gone out for the next game -- targeted, so it never touches the
	 * cycle's own record of what is finished.
	 */
	const resendCycle = useMutation(
		orpc.mail.sendStage.mutationOptions({
			onSuccess: () => toast.success("Sent again."),
			onError,
		}),
	);
	const setRole = useMutation({
		mutationFn: async (input: { userId: string; role: "admin" | "user" }) => {
			const result = await authClient.admin.setRole(input);
			if (result.error) throw new Error(result.error.message);
			return result.data;
		},
		onSuccess: (_data, input) => {
			toast.success(input.role === "admin" ? "Promoted." : "Demoted.");
			refresh();
		},
		onError,
	});

	// The next game whose cycle has actually started, and the last stage of it
	// that resolved -- that is the email this person is missing.
	const nextGame = (games.data?.upcoming ?? []).find((g) => g.callAt);
	const lastStage = nextGame
		? (
				[
					["final", nextGame.decidedAt],
					["lastCall", nextGame.lastCallAt],
					["confirmed", nextGame.confirmedAt],
					["nudge", nextGame.nudgeAt],
					["call", nextGame.callAt],
				] as const
			).find(([, at]) => at)?.[0]
		: undefined;
	const busy = suspend.isPending || unsuspend.isPending;

	// Deactivated rows are history, not roster, so they sit at the bottom.
	const rows = [...(people.data ?? [])].sort((a, b) =>
		a.effectiveStatus === "deactivated"
			? b.effectiveStatus === "deactivated"
				? 0
				: 1
			: b.effectiveStatus === "deactivated"
				? -1
				: 0,
	);

	return (
		<div className="space-y-10">
			<div>
				<span className="kicker mb-3 block text-steel-700">People</span>
				<p className="mb-6 max-w-[64ch] text-[15px] text-neutral-700 leading-6">
					One list. Everybody here gets the event emails and can take a spot;
					their link is how they get in. Somebody busy or travelling{" "}
					<strong>takes a break</strong> — no email, no spot, but their account
					and their link keep working, and they come back on their own.{" "}
					<strong>Deactivating</strong> is the other thing: it revokes access,
					signs them out everywhere and takes them off every email. Only an
					admin can do that, or undo it.
				</p>
				<p className="mb-6 max-w-[64ch] text-[15px] text-neutral-700 leading-6">
					<strong>Last {RESPONSE_WINDOW}</strong> is how each of them has
					answered the last {RESPONSE_WINDOW} invitations: how many they said in
					to, how many they answered at all — out is an answer — and how many
					they were away for. All three are out of the number after <em>of</em>,
					which is how many of those invitations they were on the list for:
					somebody who joined last month has a shorter record, not a worse one.
					Events from before we started writing this down are not in it.
				</p>
				<Blueprint className="p-5">
					<span className="kicker mb-3 block text-steel-700">Add someone</span>
					<form
						className="flex flex-wrap items-end gap-3"
						onSubmit={(e) => {
							e.preventDefault();
							add.mutate({ email: newEmail, name: newName || undefined });
						}}
					>
						<div className="min-w-[220px] flex-1 space-y-1.5">
							<Label htmlFor="new-email">Email</Label>
							<Input
								id="new-email"
								type="email"
								required
								value={newEmail}
								onChange={(e) => setNewEmail(e.target.value)}
							/>
						</div>
						<div className="min-w-[160px] space-y-1.5">
							<Label htmlFor="new-name">Name</Label>
							<Input
								id="new-name"
								maxLength={40}
								value={newName}
								onChange={(e) => setNewName(e.target.value)}
							/>
						</div>
						<Button type="submit" size="sm" disabled={add.isPending}>
							Add and send their link
						</Button>
					</form>
				</Blueprint>
			</div>

			{/*
			 * The table has to fit the page at desktop widths: an overflow wrapper
			 * scrolls silently, and nobody notices the buttons off the right edge.
			 * So nothing in a row is nowrap except the timestamp -- the address
			 * breaks anywhere, and the actions wrap to a second line. The wrapper
			 * stays only for a phone, where six columns cannot fit whatever they do.
			 */}
			<div className="overflow-x-auto">
				<table className="w-full min-w-[560px] border-collapse text-sm">
					<thead>
						<tr>
							{[
								"Name",
								"Email",
								"Role",
								"Status",
								`Last ${RESPONSE_WINDOW}`,
								"Link sent",
								"",
							].map((h, i) => (
								<th key={h || `col-${i}`} className={thClass}>
									{h}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((p) => {
							const isSelf = p.id === session?.user.id;
							const admin = p.role === "admin";
							const gone = p.effectiveStatus === "deactivated";
							const away = p.effectiveStatus === "suspended";
							const killKey = `kill:${p.id}`;
							return (
								<tr
									key={p.id}
									className={`border-ink/8 border-b [&>td]:px-2 [&>td]:py-2 ${gone ? "text-neutral-500" : ""}`}
								>
									<td className="font-heading font-semibold text-lg uppercase leading-tight tracking-[0.02em]">
										{p.name}
									</td>
									<td className="wrap-anywhere">{p.email}</td>
									<td>
										<span className={chip(admin ? "steel" : "neutral")}>
											{admin ? "Admin" : "Guest"}
										</span>
									</td>
									<td className="text-[13px]">
										{gone ? (
											<span className={chip("gone")}>
												Deactivated
												{p.statusReason ? ` — ${p.statusReason}` : ""}
											</span>
										) : away ? (
											<span className={chip("warn")}>
												{describeBreak({
													suspendedUntil: p.suspendedUntil,
													reason: p.statusReason,
												})}
											</span>
										) : (
											<span className={chip("steel")}>Active</span>
										)}
										{p.statusChangedBy === "mail" ? (
											<span className="ml-2 text-[12px] text-neutral-600">
												via mail app
											</span>
										) : null}
									</td>
									<td className="text-[12px] text-neutral-700 leading-4">
										<Record rate={p.responses} />
									</td>
									<td className="whitespace-nowrap text-[13px] text-neutral-700">
										{p.linkSentAt ? when(p.linkSentAt) : "Never sent"}
									</td>
									<td className="text-right">
										<div className="flex flex-wrap justify-end gap-x-1 gap-y-1">
											{gone ? (
												<Button
													variant="ghost"
													size="xs"
													disabled={reactivate.isPending}
													onClick={() => reactivate.mutate({ userId: p.id })}
												>
													Reactivate
												</Button>
											) : (
												<>
													<Button
														variant="ghost"
														size="xs"
														disabled={sendLink.isPending}
														onClick={() => sendLink.mutate({ userId: p.id })}
													>
														Send link
													</Button>
													{away ? (
														<Button
															variant="ghost"
															size="xs"
															disabled={busy}
															onClick={() => unsuspend.mutate({ userId: p.id })}
														>
															They're back
														</Button>
													) : (
														<Button
															variant="ghost"
															size="xs"
															onClick={() =>
																setPausing(pausing === p.id ? null : p.id)
															}
														>
															{pausing === p.id ? "Never mind" : "Break..."}
														</Button>
													)}
													{nextGame && lastStage && !away ? (
														<Button
															variant="ghost"
															size="xs"
															disabled={resendCycle.isPending}
															onClick={() =>
																resendCycle.mutate({
																	gameId: nextGame.id,
																	stage: lastStage,
																	personIds: [p.id],
																})
															}
														>
															Resend last email
														</Button>
													) : null}
													<Button
														variant="ghost"
														size="xs"
														disabled={isSelf || setRole.isPending}
														onClick={() =>
															setRole.mutate({
																userId: p.id,
																role: admin ? "user" : "admin",
															})
														}
													>
														{admin ? "Remove admin" : "Make admin"}
													</Button>
													<Button
														variant={
															confirmKey === killKey ? "destructive" : "ghost"
														}
														size="xs"
														disabled={isSelf || deactivate.isPending}
														onClick={() =>
															setConfirmKey(
																confirmKey === killKey ? null : killKey,
															)
														}
													>
														Deactivate...
													</Button>
												</>
											)}
										</div>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
				{rows.length === 0 ? (
					<p className="mt-3 text-[15px] text-neutral-700 leading-6">
						Nobody yet. Add your guests; each one gets their link by email.
					</p>
				) : null}
			</div>

			{pausing ? (
				<Blueprint className="p-5">
					<span className="kicker mb-3 block text-steel-700">
						Break for {rows.find((p) => p.id === pausing)?.name}
					</span>
					<BreakForm
						subject={rows.find((p) => p.id === pausing)?.name ?? "they"}
						pending={suspend.isPending}
						onCancel={() => setPausing(null)}
						onSubmit={(input) => suspend.mutate({ ...input, userId: pausing })}
					/>
				</Blueprint>
			) : null}

			{confirmKey?.startsWith("kill:") ? (
				<Blueprint className="border-red-300 p-5">
					<span className="kicker mb-3 block text-red-800">
						Deactivate {rows.find((p) => `kill:${p.id}` === confirmKey)?.name}
					</span>
					<p className="mb-4 max-w-[56ch] text-[13px] text-neutral-700 leading-5">
						This revokes their access, signs them out of every device, and takes
						them off every email including "everyone" sends. Their old sign-in
						links stop working. Nothing is deleted, and an admin can undo it —
						but if they are only away for a while, a break is what you want.
					</p>
					<form
						className="flex flex-wrap items-end gap-3"
						onSubmit={(e) => {
							e.preventDefault();
							deactivate.mutate({
								userId: confirmKey.slice("kill:".length),
								reason: reason.trim() || undefined,
							});
						}}
					>
						<div className="min-w-[260px] flex-1 space-y-1.5">
							<Label htmlFor="kill-reason">Why (optional)</Label>
							<Input
								id="kill-reason"
								maxLength={200}
								placeholder="Moved to Denver"
								value={reason}
								onChange={(e) => setReason(e.target.value)}
							/>
						</div>
						<Button
							type="submit"
							variant="destructive"
							size="sm"
							disabled={deactivate.isPending}
						>
							Really deactivate
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => {
								setConfirmKey(null);
								setReason("");
							}}
						>
							Cancel
						</Button>
					</form>
				</Blueprint>
			) : null}
		</div>
	);
}
