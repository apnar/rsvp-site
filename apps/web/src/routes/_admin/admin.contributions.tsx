import { Blueprint } from "@rsvp-site/ui/components/blueprint";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { Label } from "@rsvp-site/ui/components/label";
import { Textarea } from "@rsvp-site/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
	type Preview,
	PreviewPanel,
	reportSend,
} from "@/components/email-preview";
import { dollars } from "@/lib/contributions";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_admin/admin/contributions")({
	component: AdminContributionsPage,
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
		timeZone: "America/New_York",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

type PreviewKey = "call" | "reminder";
type CallDraft = {
	subject: string;
	body: string;
	amount: number;
	instructions: string;
};

/** The order the tracker reads in: who still owes, then the let-off, then the settled. */
const STATUS_RANK = { unpaid: 0, excused: 1, paid: 2 } as const;

function CallForm({
	initial,
	count,
	busy,
	canSend,
	armed,
	onPreview,
	onSendToMe,
	onArm,
	onSend,
}: {
	initial: Omit<CallDraft, "amount"> & { amount: number | null };
	count: number;
	busy: boolean;
	canSend: boolean;
	armed: boolean;
	onPreview: (draft: CallDraft) => void;
	onSendToMe: (draft: CallDraft) => void;
	onArm: () => void;
	onSend: (draft: CallDraft) => void;
}) {
	const [form, setForm] = useState({
		subject: initial.subject,
		body: initial.body,
		amount: initial.amount === null ? "" : String(initial.amount),
		instructions: initial.instructions,
	});
	const set =
		<K extends keyof typeof form>(key: K) =>
		(value: (typeof form)[K]) =>
			setForm((f) => ({ ...f, [key]: value }));

	/** The server does the real validating; this only stops an empty box. */
	const draft = (): CallDraft | null => {
		const amount = Number(form.amount);
		if (!Number.isInteger(amount) || amount <= 0) {
			toast.error("How much? Whole dollars.");
			return null;
		}
		return { ...form, amount };
	};
	const withDraft = (fn: (d: CallDraft) => void) => () => {
		const d = draft();
		if (d) fn(d);
	};

	return (
		<Blueprint className="p-6">
			<span className="kicker mb-3 block text-steel-700">Put out a call</span>
			<form
				className="space-y-4"
				onSubmit={(e) => {
					e.preventDefault();
					withDraft(onPreview)();
				}}
			>
				<div className="space-y-1.5">
					<Label htmlFor="call-subject">Subject</Label>
					<Input
						id="call-subject"
						required
						maxLength={120}
						value={form.subject}
						onChange={(e) => set("subject")(e.target.value)}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="call-body">Body</Label>
					<Textarea
						id="call-body"
						required
						maxLength={5000}
						rows={8}
						className="min-h-40 text-sm"
						value={form.body}
						onChange={(e) => set("body")(e.target.value)}
					/>
				</div>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
					<div className="space-y-1.5">
						<Label htmlFor="call-amount">Amount</Label>
						<Input
							id="call-amount"
							type="number"
							required
							min={1}
							step={1}
							inputMode="numeric"
							placeholder="40"
							value={form.amount}
							onChange={(e) => set("amount")(e.target.value)}
						/>
						<p className="text-[12px] text-neutral-600 leading-5">
							Whole dollars, per person.
						</p>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="call-instructions">How to pay</Label>
						<Input
							id="call-instructions"
							required
							maxLength={200}
							placeholder="Venmo @the-host. Cash at the door works too, exact change please."
							value={form.instructions}
							onChange={(e) => set("instructions")(e.target.value)}
						/>
						<p className="text-[12px] text-neutral-600 leading-5">
							One line. Written once; it comes back prefilled next time.
						</p>
					</div>
				</div>
				<p className="text-[12px] text-neutral-600 leading-5">
					Goes to everybody on the list ({count}). People on a break are not
					billed.
				</p>
				<div className="flex flex-wrap gap-2">
					<Button type="submit" variant="outline" size="sm" disabled={busy}>
						Preview
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={busy}
						onClick={withDraft(onSendToMe)}
					>
						Send to me first
					</Button>
					<Button
						type="button"
						variant={armed ? "default" : "outline"}
						size="sm"
						disabled={!canSend || busy}
						onClick={armed ? withDraft(onSend) : onArm}
					>
						{armed ? `Really send to ${count}` : `Send it (${count})`}
					</Button>
				</div>
			</form>
		</Blueprint>
	);
}

function ReminderForm({
	initial,
	count,
	away,
	lastRemindedAt,
	busy,
	canSend,
	armed,
	onPreview,
	onSendToMe,
	onArm,
	onSend,
}: {
	initial: string;
	count: number;
	away: number;
	lastRemindedAt: Date | string | null;
	busy: boolean;
	canSend: boolean;
	armed: boolean;
	onPreview: (body: string) => void;
	onSendToMe: (body: string) => void;
	onArm: () => void;
	onSend: (body: string) => void;
}) {
	const [body, setBody] = useState(initial);
	const owing = count + away;
	return (
		<Blueprint className="p-6">
			<span className="kicker mb-3 block text-steel-700">
				Remind the unpaid · {owing} still owe
			</span>
			{owing === 0 ? (
				<p className="m-0 text-[15px] text-neutral-700 leading-6">
					Everybody has paid. Close the books.
				</p>
			) : (
				<form
					className="space-y-4"
					onSubmit={(e) => {
						e.preventDefault();
						onPreview(body);
					}}
				>
					<div className="space-y-1.5">
						<Label htmlFor="reminder-body">Body</Label>
						<Textarea
							id="reminder-body"
							required
							maxLength={5000}
							rows={6}
							className="min-h-32 text-sm"
							value={body}
							onChange={(e) => setBody(e.target.value)}
						/>
						<p className="text-[12px] text-neutral-600 leading-5">
							The amount and how to pay ride along from the call. Only the words
							here change.
							{away > 0
								? ` ${away} of the unpaid ${away === 1 ? "is" : "are"} on a break and will not get this.`
								: ""}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button type="submit" variant="outline" size="sm" disabled={busy}>
							Preview
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							disabled={busy || !body}
							onClick={() => onSendToMe(body)}
						>
							Send to me first
						</Button>
						<Button
							type="button"
							variant={armed ? "default" : "outline"}
							size="sm"
							disabled={!canSend || busy || count === 0}
							onClick={armed ? () => onSend(body) : onArm}
						>
							{armed ? `Really send to ${count}` : `Send it (${count})`}
						</Button>
						{lastRemindedAt ? (
							<span className="text-[12px] text-neutral-600">
								Last reminder {when(lastRemindedAt)}
							</span>
						) : null}
					</div>
				</form>
			)}
		</Blueprint>
	);
}

function AdminContributionsPage() {
	const queryClient = useQueryClient();
	const status = useQuery(orpc.mail.status.queryOptions());
	const current = useQuery(orpc.contributions.current.queryOptions());
	const history = useQuery(orpc.contributions.history.queryOptions());

	const [preview, setPreview] = useState<
		(Preview & { recipientCount: number; key: PreviewKey }) | null
	>(null);
	const [confirmKey, setConfirmKey] = useState<string | null>(null);

	const onError = (error: Error) => toast.error(error.message);
	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: orpc.contributions.key() });
		queryClient.invalidateQueries({ queryKey: orpc.mail.key() });
		setConfirmKey(null);
	};

	const previewCall = useMutation(
		orpc.contributions.previewCall.mutationOptions({
			onSuccess: (data) => setPreview({ ...data, key: "call" }),
			onError,
		}),
	);
	const sendCall = useMutation(
		orpc.contributions.sendCall.mutationOptions({
			onSuccess: (result, input) => {
				if (input.toSelf) {
					toast.success("Sent to you. Go look.");
				} else {
					reportSend(result);
					setPreview(null);
				}
				refresh();
			},
			onError,
		}),
	);
	const previewReminder = useMutation(
		orpc.contributions.previewReminder.mutationOptions({
			onSuccess: (data) => setPreview({ ...data, key: "reminder" }),
			onError,
		}),
	);
	const sendReminder = useMutation(
		orpc.contributions.sendReminder.mutationOptions({
			onSuccess: (result, input) => {
				if (input.toSelf) {
					toast.success("Sent to you. Go look.");
				} else {
					reportSend(result);
					setPreview(null);
				}
				refresh();
			},
			onError,
		}),
	);
	const mark = useMutation(
		orpc.contributions.mark.mutationOptions({ onSuccess: refresh, onError }),
	);
	const close = useMutation(
		orpc.contributions.close.mutationOptions({
			onSuccess: () => {
				toast.success("Books closed.");
				setPreview(null);
				refresh();
			},
			onError,
		}),
	);

	const busy =
		previewCall.isPending ||
		sendCall.isPending ||
		previewReminder.isPending ||
		sendReminder.isPending;
	const data = current.data;
	const open = data?.open ?? null;

	const ledger = open
		? [...open.ledger].sort((a, b) => {
				// Deactivated rows are history, not roster, so they sit at the bottom.
				const goneA = a.personStatus === "deactivated" ? 1 : 0;
				const goneB = b.personStatus === "deactivated" ? 1 : 0;
				if (goneA !== goneB) return goneA - goneB;
				const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
				return rank !== 0 ? rank : a.name.localeCompare(b.name);
			})
		: [];

	return (
		<div className="space-y-12">
			{status.data?.dryRun ? (
				<p className="border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 leading-5">
					BREVO_API_KEY is not set here, so emails are printed to the server log
					instead of sent. Everything else works the same.
				</p>
			) : null}

			<div className="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
				<div className="space-y-10">
					{current.isLoading || !data ? (
						<p className="text-[15px] text-neutral-700 leading-6">
							Checking the books...
						</p>
					) : open ? (
						<>
							<Blueprint className="p-6">
								<div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
									<span className="kicker text-steel-700">
										Open call · opened {when(open.openedAt)}
									</span>
									<span className="text-[13px] text-neutral-700">
										{dollars(open.amount)} each · sent to {open.sentTo}
										{open.failed > 0 ? `, ${open.failed} failed` : ""}
									</span>
								</div>
								<p className="m-0 font-heading font-semibold text-2xl uppercase leading-7 tracking-[0.02em]">
									{open.subject}
								</p>
								<p className="tnum mt-2 mb-0 font-heading font-semibold text-[22px] text-steel-700 leading-7">
									{open.tallyLine}
								</p>
								<div className="mt-5 overflow-x-auto">
									<table className="w-full border-collapse text-sm">
										<thead>
											<tr>
												{["Name", "Status", "Marked", ""].map((h, i) => (
													<th key={h || `col-${i}`} className={thClass}>
														{h}
													</th>
												))}
											</tr>
										</thead>
										<tbody>
											{ledger.map((row) => {
												const gone = row.personStatus === "deactivated";
												const away = row.personStatus === "suspended";
												return (
													<tr
														key={row.userId}
														className={`border-ink/8 border-b [&>td]:px-2 [&>td]:py-2 ${gone ? "text-neutral-500" : ""}`}
													>
														<td className="font-heading font-semibold text-lg uppercase leading-6 tracking-[0.02em]">
															{row.name}
															{gone ? (
																<span className="kicker ml-2 text-[11px] text-neutral-500">
																	gone
																</span>
															) : away ? (
																<span className="kicker ml-2 text-[11px] text-amber-800">
																	on a break
																</span>
															) : null}
														</td>
														<td>
															<span
																className={chip(
																	row.status === "paid"
																		? "steel"
																		: row.status === "unpaid"
																			? "warn"
																			: "neutral",
																)}
															>
																{row.status === "paid"
																	? "Paid"
																	: row.status === "unpaid"
																		? `Owes ${dollars(open.amount)}`
																		: "Excused"}
															</span>
														</td>
														<td className="whitespace-nowrap text-[13px] text-neutral-700">
															{when(row.markedAt)}
														</td>
														<td className="whitespace-nowrap text-right">
															{row.status === "unpaid" ? (
																<>
																	<Button
																		variant="ghost"
																		size="xs"
																		disabled={mark.isPending}
																		onClick={() =>
																			mark.mutate({
																				userId: row.userId,
																				status: "paid",
																			})
																		}
																	>
																		Paid
																	</Button>
																	<Button
																		variant="ghost"
																		size="xs"
																		disabled={mark.isPending}
																		onClick={() =>
																			mark.mutate({
																				userId: row.userId,
																				status: "excused",
																			})
																		}
																	>
																		Excuse
																	</Button>
																</>
															) : (
																<Button
																	variant="ghost"
																	size="xs"
																	disabled={mark.isPending}
																	onClick={() =>
																		mark.mutate({
																			userId: row.userId,
																			status: "unpaid",
																		})
																	}
																>
																	Not paid
																</Button>
															)}
														</td>
													</tr>
												);
											})}
										</tbody>
									</table>
								</div>
								<div className="mt-4 flex flex-wrap items-center gap-3 border-divider border-t pt-4">
									<Button
										variant={confirmKey === "close" ? "destructive" : "outline"}
										size="sm"
										disabled={close.isPending}
										onClick={() => {
											if (confirmKey === "close") close.mutate({});
											else setConfirmKey("close");
										}}
									>
										{confirmKey === "close"
											? `Really close it${open.tally.unpaid > 0 ? `. ${open.tally.unpaid} still owe.` : "."}`
											: "Close the books"}
									</Button>
									{confirmKey === "close" ? (
										<Button
											variant="ghost"
											size="sm"
											onClick={() => setConfirmKey(null)}
										>
											Never mind
										</Button>
									) : null}
									<span className="text-[12px] text-neutral-600 leading-5">
										Closing stops the reminders and the notice on everyone's
										account page. The tally stays here.
									</span>
								</div>
							</Blueprint>

							<ReminderForm
								key={open.id}
								initial={data.defaults.reminderBody}
								count={open.unpaidReachable}
								away={open.unpaidAway}
								lastRemindedAt={open.lastRemindedAt}
								busy={busy}
								canSend={preview?.key === "reminder"}
								armed={confirmKey === "reminder"}
								onPreview={(body) => previewReminder.mutate({ body })}
								onSendToMe={(body) =>
									sendReminder.mutate({ body, toSelf: true })
								}
								onArm={() => setConfirmKey("reminder")}
								onSend={(body) => sendReminder.mutate({ body, toSelf: false })}
							/>
						</>
					) : (
						<CallForm
							key={current.dataUpdatedAt}
							initial={{
								subject: data.defaults.subject,
								body: data.defaults.body,
								amount: data.prefill?.amount ?? null,
								instructions: data.prefill?.instructions ?? "",
							}}
							count={data.activeCount}
							busy={busy}
							canSend={preview?.key === "call"}
							armed={confirmKey === "call"}
							onPreview={(draft) => previewCall.mutate(draft)}
							onSendToMe={(draft) =>
								sendCall.mutate({ ...draft, toSelf: true })
							}
							onArm={() => setConfirmKey("call")}
							onSend={(draft) => sendCall.mutate({ ...draft, toSelf: false })}
						/>
					)}
				</div>

				<div>
					{preview ? (
						<PreviewPanel preview={preview} onClose={() => setPreview(null)} />
					) : (
						<Blueprint className="flex min-h-40 items-center justify-center p-6 text-center text-[15px] text-neutral-700 leading-6">
							Preview an email and it shows up here.
						</Blueprint>
					)}
				</div>
			</div>

			<div>
				<span className="kicker mb-3 block text-steel-700">Past calls</span>
				{(history.data ?? []).length === 0 ? (
					<p className="text-[15px] text-neutral-700 leading-6">
						No calls yet. The host has been covering it so far.
					</p>
				) : (
					<ul className="m-0 list-none space-y-3 p-0">
						{(history.data ?? []).map((row) => (
							<li
								key={row.id}
								className="border-ink/8 border-b pb-3 text-sm leading-5"
							>
								<div className="flex flex-wrap items-baseline justify-between gap-x-3">
									<span className="font-semibold">{row.subject}</span>
									<span className="text-[12px] text-neutral-600">
										{when(row.openedAt)} – {when(row.closedAt)}
									</span>
								</div>
								<div className="tnum text-[13px] text-neutral-700">
									{dollars(row.amount)} each · {row.tallyLine}
								</div>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
