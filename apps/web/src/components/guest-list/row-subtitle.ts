import { formatPhone } from "@rsvp-site/db/phone";
import { ago, shortDate } from "@/lib/format";
import type { Guest } from "./types";

/**
 * The grey line under a guest's name: who they are to this list right now.
 * Their address (or its absence) with when they answered, or with how far
 * their invitation has got: when they first opened it, or when it went
 * out (the list's sections already say whether they have looked).
 * Somebody with no email is known by their number, so a guest the host
 * added by phone alone is not a blank line. An answer or a first look says
 * how the guest came to it, where that was recorded.
 * In two parts, drawn as two lines: an address cut short beside the
 * status left most of the list unreadable.
 */
export function rowSubtitle(
	g: Pick<
		Guest,
		| "email"
		| "response"
		| "respondedAt"
		| "respondedVia"
		| "invitedAt"
		| "hasPaper"
		| "noEmail"
		| "viewedAt"
		| "viewedVia"
		| "phone"
		| "invitedVia"
		| "textable"
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
	const email = g.email || formatPhone(g.phone) || "No email";
	if (g.response !== null) {
		return line(email, withVia(answered, g.respondedVia));
	}
	if (g.viewedAt) {
		return line(
			email,
			withVia(`viewed ${ago(g.viewedAt, nowMs)}`, g.viewedVia),
		);
	}
	if (g.invitedAt) {
		const by =
			g.invitedVia === "text"
				? " by text"
				: g.invitedVia === "both"
					? " by email and text"
					: "";
		return line(email, `invited${by} ${shortDate(g.invitedAt)}`);
	}
	if (paper) {
		return line(email, `paper invite${g.hasPaper ? "" : ", not printed yet"}`);
	}
	// Nobody is emailed for a name-only guest: a relative answers if one is
	// on the list, and otherwise the host does. One with a number the site
	// may text is invited by text instead.
	if (g.noEmail && !g.textable) {
		return line(email, familyOnList ? "family answers" : "you answer for them");
	}
	return line(email, "not invited yet");
}

type Via = NonNullable<Guest["respondedVia"]>;

const VIA_WORDS: Record<Via, string> = {
	email: "via email",
	text: "via text",
	paper: "via paper",
	direct: "via the site",
	host: "by a host",
};

/** "2 hours ago via email"; rows from before this was kept have no via. */
function withVia(when: string | null, via: Via | null): string | null {
	const how = via ? VIA_WORDS[via] : null;
	if (!when) return how;
	return how ? `${when} ${how}` : when;
}

/** The subtitle as one line of text. */
export function subtitleText(sub: { lead: string; status: string | null }) {
	return sub.status ? `${sub.lead} · ${sub.status}` : sub.lead;
}
