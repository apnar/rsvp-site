import { ago, shortDate } from "@/lib/format";
import type { Guest } from "./types";

/**
 * The grey line under a guest's name: who they are to this list right now.
 * Their address (or its absence) with when they answered, or with how far
 * their invitation has got.
 */
export function rowSubtitle(
	g: Pick<
		Guest,
		"email" | "response" | "respondedAt" | "invitedAt" | "hasPaper" | "noEmail"
	>,
	opts: {
		isYou: boolean;
		paper: boolean;
		nowMs: number;
		/** Somebody else on this list shares their family. */
		familyOnList?: boolean;
	},
): string {
	const { isYou, paper, nowMs, familyOnList = false } = opts;
	const answered = g.respondedAt ? ` · ${ago(g.respondedAt, nowMs)}` : "";
	if (isYou) return `That's you${answered}`;
	const email = g.email || "No email";
	if (g.response !== null) return `${email}${answered}`;
	if (g.invitedAt) return `${email} · invited ${shortDate(g.invitedAt)}`;
	if (paper) {
		return `${email} · paper invite${g.hasPaper ? "" : ", not printed yet"}`;
	}
	// Nobody is emailed for a name-only guest: a relative answers if one is
	// on the list, and otherwise the host does.
	if (g.noEmail) {
		return `No email · ${familyOnList ? "family answers" : "you answer for them"}`;
	}
	return `${g.email} · not invited yet`;
}
