import { ago, shortDate } from "@/lib/format";
import type { Guest } from "./types";

/**
 * The grey line under a guest's name: who they are to this list right now.
 * Their address (or its absence) with when they answered, or with how far
 * their invitation has got: when they first opened it, or when it went
 * out (the list's sections already say whether they have looked).
 * In two parts, so a long address can be cut short on a narrow row while
 * the status after it (the part a host is scanning for) always shows.
 */
export function rowSubtitle(
	g: Pick<
		Guest,
		| "email"
		| "response"
		| "respondedAt"
		| "invitedAt"
		| "hasPaper"
		| "noEmail"
		| "viewedAt"
	>,
	opts: {
		isYou: boolean;
		paper: boolean;
		nowMs: number;
		/** Somebody else on this list shares their family. */
		familyOnList?: boolean;
	},
): { lead: string; status: string | null } {
	const { isYou, paper, nowMs, familyOnList = false } = opts;
	const line = (lead: string, status: string | null = null) => ({
		lead,
		status,
	});
	const answered = g.respondedAt ? ago(g.respondedAt, nowMs) : null;
	if (isYou) return line("That's you", answered);
	const email = g.email || "No email";
	if (g.response !== null) return line(email, answered);
	if (g.viewedAt) return line(email, `viewed ${ago(g.viewedAt, nowMs)}`);
	if (g.invitedAt) {
		return line(email, `invited ${shortDate(g.invitedAt)}`);
	}
	if (paper) {
		return line(email, `paper invite${g.hasPaper ? "" : ", not printed yet"}`);
	}
	// Nobody is emailed for a name-only guest: a relative answers if one is
	// on the list, and otherwise the host does.
	if (g.noEmail) {
		return line(
			"No email",
			familyOnList ? "family answers" : "you answer for them",
		);
	}
	return line(g.email, "not invited yet");
}

/** The subtitle as one line of text. */
export function subtitleText(sub: { lead: string; status: string | null }) {
	return sub.status ? `${sub.lead} · ${sub.status}` : sub.lead;
}
