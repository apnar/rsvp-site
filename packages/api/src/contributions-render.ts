import type { Rendered } from "@rsvp-site/email";
import {
	contributionCallEmail,
	contributionReminderEmail,
} from "@rsvp-site/email";
import { siteUrl } from "@rsvp-site/email/worker";

/*
 * The one place the contribution emails are rendered, for the same reason
 * `jobs/stage-render.ts` exists: the preview, the test copy to yourself and
 * the real send all come through here, so what the admin looked at is what
 * went out. Reaches `siteUrl()` and therefore the Worker env -- the web app
 * must not import this file.
 */

export type CallDraft = {
	subject: string;
	body: string;
	amount: number;
	instructions: string;
};

export function renderCall(draft: CallDraft): Rendered {
	return contributionCallEmail({ ...draft, siteUrl: siteUrl() });
}

export function renderReminder(input: {
	body: string;
	amount: number;
	instructions: string;
}): Rendered {
	return contributionReminderEmail({ ...input, siteUrl: siteUrl() });
}
