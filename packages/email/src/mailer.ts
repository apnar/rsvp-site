import {
	type Address,
	type BrevoRequest,
	chunk,
	MAX_VERSIONS_PER_CALL,
	type MessageVersion,
	postBrevo,
	type Rendered,
	type SendOutcome,
	unblockContact,
} from "./brevo";

/** Someone on the list, with the link that takes them off it. */
export type ListRecipient = {
	email: string;
	name: string | null;
	unsubscribeUrl: string;
	/** Their sign-in token, substituted into every link back to the site. */
	linkToken: string | null;
};

export type ListResult = {
	attempted: number;
	sent: number;
	failed: { emails: string[]; error: string }[];
	messageIds: string[];
};

export type Mailer = {
	/** Whether emails are being logged instead of sent (no API key). */
	dryRun: boolean;
	/** One email to one person. Auth emails use this. */
	sendOne(
		to: Address,
		rendered: Rendered,
		opts?: { tags?: string[]; params?: Record<string, string> },
	): Promise<SendOutcome>;
	/**
	 * One email to everyone on the list, personalised per recipient through
	 * Brevo `messageVersions` so each copy carries its own unsubscribe link.
	 */
	sendList(
		recipients: ListRecipient[],
		rendered: Rendered,
		opts?: { tags?: string[] },
	): Promise<ListResult>;
	/** Lift Brevo's transactional block on an address that rejoined the list. */
	unblock(email: string): Promise<boolean>;
};

export type MailerOptions = {
	apiKey?: string | undefined;
	sender: Address;
	replyTo?: Address;
	fetch?: typeof fetch;
	log?: (line: string) => void;
};

function versionsFor(recipients: ListRecipient[]): MessageVersion[] {
	return recipients.map((r) => ({
		to: [{ email: r.email, name: r.name }],
		params: {
			name: r.name ?? "",
			unsubscribeUrl: r.unsubscribeUrl,
			key: r.linkToken ?? "",
		},
	}));
}

export function createMailer(options: MailerOptions): Mailer {
	const log = options.log ?? ((line: string) => console.log(line));
	const apiKey = options.apiKey?.trim();
	const dryRun = !apiKey;

	function base(rendered: Rendered, tags?: string[]): BrevoRequest {
		return {
			sender: options.sender,
			replyTo: options.replyTo,
			subject: rendered.subject,
			htmlContent: rendered.html,
			textContent: rendered.text,
			tags,
		};
	}

	/**
	 * Print the email instead of sending it. `params` are substituted the way
	 * Brevo would, so a sign-in link in the console is clickable.
	 */
	function logDryRun(
		label: string,
		rendered: Rendered,
		params?: Record<string, string>,
	) {
		let text = rendered.text;
		for (const [name, value] of Object.entries(params ?? {})) {
			text = text.replaceAll(`{{ params.${name} }}`, value);
		}
		log(
			[
				`[email dry run] ${label}`,
				`Subject: ${rendered.subject}`,
				"",
				text,
			].join("\n"),
		);
	}

	async function send(body: BrevoRequest): Promise<SendOutcome> {
		if (!apiKey) return { ok: true, messageId: "dry-run" };
		return postBrevo(body, { apiKey, fetch: options.fetch });
	}

	return {
		dryRun,

		async sendOne(to, rendered, opts) {
			if (dryRun) logDryRun(`to ${to.email}`, rendered, opts?.params);
			return send({
				...base(rendered, opts?.tags),
				to: [to],
				params: opts?.params,
			});
		},

		async sendList(recipients, rendered, opts) {
			const result: ListResult = {
				attempted: recipients.length,
				sent: 0,
				failed: [],
				messageIds: [],
			};
			if (recipients.length === 0) return result;
			if (dryRun) {
				logDryRun(
					`to ${recipients.length} subscriber(s)`,
					rendered,
					versionsFor(recipients.slice(0, 1))[0]?.params,
				);
			}
			for (const batch of chunk(recipients, MAX_VERSIONS_PER_CALL)) {
				// No List-Unsubscribe header here: Brevo replaces it with its own
				// one-click link on every email. The app learns about those through
				// the Brevo webhook; the footer link in each template is ours.
				const outcome = await send({
					...base(rendered, opts?.tags),
					messageVersions: versionsFor(batch),
				});
				if (outcome.ok) {
					result.sent += batch.length;
					result.messageIds.push(outcome.messageId);
				} else {
					result.failed.push({
						emails: batch.map((r) => r.email),
						error: `${outcome.status}: ${outcome.error}`.slice(0, 500),
					});
				}
			}
			return result;
		},

		async unblock(email) {
			if (!apiKey) return true;
			const result = await unblockContact(email, {
				apiKey,
				fetch: options.fetch,
			});
			if (!result.ok) log(`[email] unblock ${email} failed: ${result.status}`);
			return result.ok;
		},
	};
}
