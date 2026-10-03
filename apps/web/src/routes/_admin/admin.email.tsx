import type { EmailKind } from "@rsvp-site/db/schema/email";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { Textarea } from "@rsvp-site/ui/components/textarea";
import { cn } from "@rsvp-site/ui/lib/utils";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/controls";
import { PreviewPanel, reportSend } from "@/components/email-preview";
import { Notice } from "@/components/notice";
import { Panel } from "@/components/page";
import { pageTitle } from "@/content/site";
import { when } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_admin/admin/email")({
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(orpc.mail.status.queryOptions()),
			context.queryClient.ensureQueryData(orpc.mail.recent.queryOptions()),
		]),
	head: () => ({ meta: [{ title: pageTitle("Email") }] }),
	component: AdminEmailPage,
});

// A Record over every kind, so adding one to EMAIL_KINDS fails to compile here.
const KIND: Record<EmailKind, string> = {
	invite: "Invite",
	deadline_reminder: "Deadline reminder",
	day_before: "Day before",
	update: "Change",
	cancel: "Canceled",
	nudge: "Nudge",
	host_alert: "Host alert",
	host_digest: "Host digest",
	join_link: "Share link",
	welcome: "Welcome",
	message: "Message",
};

/**
 * A message to everybody on the site, and the log of every send. Event mail
 * is sent from the events themselves; this is for the rare word to all.
 */
function AdminEmailPage() {
	const queryClient = useQueryClient();
	const { data: status } = useSuspenseQuery(orpc.mail.status.queryOptions());
	const { data: recent } = useSuspenseQuery(orpc.mail.recent.queryOptions());
	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");
	const onError = (error: Error) => toast.error(error.message);

	const preview = useMutation(
		orpc.mail.previewMessage.mutationOptions({ onError }),
	);
	const send = useMutation(
		orpc.mail.sendMessage.mutationOptions({
			onSuccess: (result, input) => {
				reportSend(result);
				if (!input.toSelf) {
					setSubject("");
					setBody("");
					preview.reset();
				}
				queryClient.invalidateQueries({ queryKey: orpc.mail.key() });
			},
			onError,
		}),
	);
	const ready = subject.trim() && body.trim();

	return (
		<div className="flex flex-col gap-7">
			{status.dryRun ? (
				<Notice>
					No Brevo key: email is printed to the server log, not sent.
				</Notice>
			) : null}
			<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-5">
				<Panel as="form" onSubmit={(e) => e.preventDefault()}>
					<h2 className="m-0 text-[20px]">Message everybody</h2>
					<p className="m-0 text-[14px] text-haze">
						Goes to {status.everyone} people: everyone not unsubscribed or
						deactivated.
					</p>
					<Field label="Subject" htmlFor="subject">
						<Input
							id="subject"
							value={subject}
							maxLength={120}
							onChange={(e) => setSubject(e.target.value)}
						/>
					</Field>
					<Field label="Message" htmlFor="body">
						<Textarea
							id="body"
							value={body}
							maxLength={5000}
							className="min-h-40"
							onChange={(e) => setBody(e.target.value)}
						/>
					</Field>
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							disabled={!ready || preview.isPending}
							onClick={() => preview.mutate({ subject, body })}
						>
							Preview
						</Button>
						<Button
							variant="secondary"
							disabled={!ready || send.isPending}
							onClick={() => send.mutate({ subject, body, toSelf: true })}
						>
							Send to me first
						</Button>
						<Button
							variant="send"
							disabled={!ready || send.isPending}
							onClick={() => send.mutate({ subject, body, toSelf: false })}
						>
							Send to everybody
						</Button>
					</div>
				</Panel>
				{preview.data ? (
					<PreviewPanel
						preview={preview.data}
						onClose={() => preview.reset()}
					/>
				) : null}
			</div>

			<section className="flex flex-col gap-3">
				<h2 className="m-0 text-[22px]">Recent sends</h2>
				{recent.length === 0 ? (
					<p className="m-0 text-soft">Nothing sent yet.</p>
				) : (
					recent.map((s) => (
						<div
							key={s.id}
							className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-[18px] bg-panel px-5 py-3.5"
						>
							<span className="flex-[0_0_130px] font-bold text-[13px] text-lime-ink uppercase tracking-[0.06em]">
								{KIND[s.kind]}
							</span>
							<span className="min-w-0 flex-[1_1_240px]">
								<b>{s.subject}</b>
								{s.eventTitle ? (
									<span className="block text-[13px] text-haze">
										{s.eventTitle}
									</span>
								) : null}
							</span>
							<span
								className={cn(
									"text-[14px]",
									s.failedCount > 0 ? "text-pink-ink" : "text-soft",
								)}
							>
								{s.recipientCount - s.failedCount} of {s.recipientCount}
								{s.failedCount > 0 ? `, ${s.failedCount} failed` : ""}
							</span>
							<span className="text-[13px] text-haze">{when(s.createdAt)}</span>
						</div>
					))
				)}
			</section>
		</div>
	);
}
