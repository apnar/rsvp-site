import { STAGES } from "@rsvp-site/api/cycle";
import { Blueprint } from "@rsvp-site/ui/components/blueprint";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { Label } from "@rsvp-site/ui/components/label";
import { Textarea } from "@rsvp-site/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
	type Preview,
	PreviewPanel,
	reportSend,
} from "@/components/email-preview";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_admin/admin/email")({
	component: AdminEmailPage,
});

const chip = (tone: "steel" | "neutral" | "warn") =>
	`inline-flex items-center px-2.5 py-[3px] text-[11px] tracking-[0.02em] ${
		tone === "steel"
			? "bg-steel-100 text-steel-800"
			: tone === "warn"
				? "bg-amber-100 text-amber-900"
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

function AdminEmailPage() {
	const queryClient = useQueryClient();
	const status = useQuery(orpc.mail.status.queryOptions());
	const games = useQuery(orpc.games.list.queryOptions());
	const recent = useQuery(orpc.mail.recent.queryOptions());

	const [preview, setPreview] = useState<
		(Preview & { recipientCount: number; key: string }) | null
	>(null);
	const [confirmKey, setConfirmKey] = useState<string | null>(null);
	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");
	const [audience, setAudience] = useState<"active" | "everyone">("active");

	const onError = (error: Error) => toast.error(error.message);
	const refreshAll = () => {
		queryClient.invalidateQueries({ queryKey: orpc.games.key() });
		queryClient.invalidateQueries({ queryKey: orpc.mail.key() });
		queryClient.invalidateQueries({ queryKey: orpc.people.key() });
		setConfirmKey(null);
	};

	const previewStage = useMutation(
		orpc.mail.previewStage.mutationOptions({
			onSuccess: (data, input) =>
				setPreview({ ...data, key: `${input.stage}:${input.gameId}` }),
			onError,
		}),
	);
	const previewMessage = useMutation(
		orpc.mail.previewMessage.mutationOptions({
			onSuccess: (data) => setPreview({ ...data, key: "message" }),
			onError,
		}),
	);
	const sendStage = useMutation(
		orpc.mail.sendStage.mutationOptions({
			onSuccess: (result) => {
				reportSend(result);
				refreshAll();
			},
			onError,
		}),
	);
	const callIt = useMutation(
		orpc.mail.callIt.mutationOptions({
			onSuccess: (result) => {
				reportSend(result);
				refreshAll();
			},
			onError,
		}),
	);
	const sendMessage = useMutation(
		orpc.mail.sendMessage.mutationOptions({
			onSuccess: (result, input) => {
				if (input.toSelf) {
					toast.success("Sent to you. Go look.");
				} else {
					reportSend(result);
					setSubject("");
					setBody("");
					setPreview(null);
				}
				refreshAll();
			},
			onError,
		}),
	);
	const upcoming = games.data?.upcoming ?? [];
	const activeCount = status.data?.counts.active ?? 0;
	const everyoneCount = status.data?.counts.everyone ?? 0;
	/** Every cycle email is active-only. Only a message offers the choice. */
	const recipientCount = activeCount;
	const messageCount = audience === "everyone" ? everyoneCount : activeCount;
	const sending =
		sendStage.isPending || callIt.isPending || sendMessage.isPending;

	const confirmButton = (
		key: string,
		label: string,
		onConfirm: () => void,
		disabled = false,
	) => (
		<Button
			variant={confirmKey === key ? "default" : "outline"}
			size="xs"
			disabled={disabled || sending}
			onClick={() => {
				if (confirmKey === key) {
					onConfirm();
				} else {
					setConfirmKey(key);
				}
			}}
		>
			{confirmKey === key ? `Really send to ${recipientCount}` : label}
		</Button>
	);

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
					<div>
						<span className="kicker mb-3 block text-steel-700">
							The cycle · {recipientCount} on the list
						</span>
						<p className="mb-4 max-w-[60ch] text-[13px] text-neutral-700 leading-5">
							These go out on their own now, on the schedule written up on{" "}
							<Link to="/admin/cycle">the Cycle tab</Link>. The buttons here are
							for when they should not have to wait.
						</p>
						{upcoming.length === 0 ? (
							<p className="text-[15px] text-neutral-700 leading-6">
								Nothing booked. Book an event first and the cycle starts the
								evening before.
							</p>
						) : (
							<ul className="m-0 list-none space-y-5 p-0">
								{upcoming.map((g) => (
									<li key={g.id}>
										<Blueprint className="p-4">
											<div className="flex flex-wrap items-baseline justify-between gap-3">
												<span className="font-heading font-semibold text-lg uppercase tracking-[0.02em]">
													{g.dateLabel}
												</span>
												<span className="text-[13px] text-neutral-700">
													{g.timeLabel} · {g.gym.name} · {g.inCount} in
												</span>
												<span
													className={chip(
														g.status === "confirmed"
															? "steel"
															: g.status === "canceled"
																? "warn"
																: "neutral",
													)}
												>
													{g.status === "confirmed"
														? "On"
														: g.status === "canceled"
															? "Off"
															: "Not called"}
												</span>
											</div>
											<div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-divider border-t pt-3">
												{STAGES.map((stage) => {
													const key = `${stage.key}:${g.id}`;
													const doneAt = g[stage.column] as
														| string
														| Date
														| null;
													return (
														<div
															key={stage.key}
															className="flex items-center gap-2"
														>
															<span
																className={chip(doneAt ? "steel" : "neutral")}
															>
																{stage.num} {stage.title}
																{doneAt ? ` · ${when(doneAt)}` : ""}
															</span>
															<Button
																variant="ghost"
																size="xs"
																onClick={() =>
																	previewStage.mutate({
																		gameId: g.id,
																		stage: stage.key,
																	})
																}
															>
																Preview
															</Button>
															{confirmButton(
																key,
																"Send now",
																() =>
																	sendStage.mutate({
																		gameId: g.id,
																		stage: stage.key,
																	}),
																preview?.key !== key,
															)}
														</div>
													);
												})}
											</div>
											{/*
											 * The 7:30 count is the rule; this is the exception.
											 * Seven in and four maybes is a night a human might
											 * still want to play.
											 */}
											<div className="mt-3 flex flex-wrap items-center gap-2 border-divider border-t pt-3">
												<span className="kicker text-steel-700">
													Overrule it
												</span>
												{confirmButton(
													`on:${g.id}`,
													"Call it on",
													() => callIt.mutate({ gameId: g.id, decision: "on" }),
													false,
												)}
												{confirmButton(
													`off:${g.id}`,
													"Call it off",
													() =>
														callIt.mutate({ gameId: g.id, decision: "off" }),
													false,
												)}
											</div>
										</Blueprint>
									</li>
								))}
							</ul>
						)}
					</div>

					<Blueprint className="p-6">
						<span className="kicker mb-3 block text-steel-700">
							Message the list
						</span>
						<form
							className="space-y-4"
							onSubmit={(e) => {
								e.preventDefault();
								previewMessage.mutate({ subject, body, audience });
							}}
						>
							<div className="space-y-1.5">
								<Label htmlFor="subject">Subject</Label>
								<Input
									id="subject"
									required
									maxLength={120}
									placeholder="Change of venue for Saturday"
									value={subject}
									onChange={(e) => setSubject(e.target.value)}
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="body">Body</Label>
								<Textarea
									id="body"
									required
									maxLength={5000}
									rows={6}
									className="min-h-32 text-sm"
									placeholder="The garden is flooded, so we are moving indoors. Same time. Bring a jacket."
									value={body}
									onChange={(e) => setBody(e.target.value)}
								/>
							</div>
							<fieldset className="space-y-1.5 border-0 p-0">
								<legend className="kicker mb-1.5 text-steel-700">
									Who hears it
								</legend>
								<label className="mr-5 text-sm">
									<input
										type="radio"
										name="audience"
										className="mr-1.5"
										checked={audience === "active"}
										onChange={() => {
											setAudience("active");
											setPreview(null);
										}}
									/>
									Active ({activeCount})
								</label>
								<label className="text-sm">
									<input
										type="radio"
										name="audience"
										className="mr-1.5"
										checked={audience === "everyone"}
										onChange={() => {
											setAudience("everyone");
											setPreview(null);
										}}
									/>
									Everyone ({everyoneCount})
								</label>
								<p className="mt-1 text-[12px] text-neutral-600 leading-5">
									{audience === "everyone"
										? "Also reaches people taking a break. For the rare thing they would want anyway."
										: "Everybody on the list. People taking a break sit this one out."}
								</p>
							</fieldset>
							<div className="flex flex-wrap gap-2">
								<Button type="submit" variant="outline" size="sm">
									Preview
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={!subject || !body || sending}
									onClick={() =>
										sendMessage.mutate({
											subject,
											body,
											audience,
											toSelf: true,
										})
									}
								>
									Send to me first
								</Button>
								<Button
									type="button"
									variant={confirmKey === "message" ? "default" : "outline"}
									size="sm"
									disabled={preview?.key !== "message" || sending}
									onClick={() => {
										if (confirmKey === "message") {
											sendMessage.mutate({
												subject,
												body,
												audience,
												toSelf: false,
											});
										} else {
											setConfirmKey("message");
										}
									}}
								>
									{confirmKey === "message"
										? `Really send to ${messageCount}`
										: `Send it (${messageCount})`}
								</Button>
							</div>
						</form>
					</Blueprint>
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
				<div>
					<span className="kicker mb-3 block text-steel-700">Recent sends</span>
					{(recent.data ?? []).length === 0 ? (
						<p className="text-[15px] text-neutral-700 leading-6">
							Nothing sent yet.
						</p>
					) : (
						<ul className="m-0 list-none space-y-3 p-0">
							{(recent.data ?? []).map((row) => (
								<li
									key={row.id}
									className="border-ink/8 border-b pb-3 text-sm leading-5"
								>
									<div className="flex flex-wrap items-baseline justify-between gap-x-3">
										<span className="font-semibold">{row.subject}</span>
										<span className="text-[12px] text-neutral-600">
											{when(row.createdAt)}
										</span>
									</div>
									<div className="text-[13px] text-neutral-700">
										<span className="capitalize">{row.kind}</span> ·{" "}
										{row.recipientCount} recipient
										{row.recipientCount === 1 ? "" : "s"}
										{row.audience === "everyone" ? (
											<span className={`ml-2 ${chip("neutral")}`}>
												Everyone
											</span>
										) : null}
										{row.failedCount > 0 ? (
											<span className={`ml-2 ${chip("warn")}`}>
												{row.failedCount} failed
											</span>
										) : null}
									</div>
									{row.errors.length > 0 ? (
										<details className="mt-1 text-[12px] text-neutral-700">
											<summary className="cursor-pointer">What failed</summary>
											{row.errors.map((e) => (
												<p
													key={e.error + e.emails.join(",")}
													className="m-0 mt-1"
												>
													{e.emails.join(", ")}: {e.error}
												</p>
											))}
										</details>
									) : null}
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</div>
	);
}
