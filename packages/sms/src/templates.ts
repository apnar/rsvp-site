import { toGsm } from "./segments";

export type TextFacts = {
	title: string;
	/** Who is hosting, e.g. "Josh" or the event's host line; may be "". */
	hostName: string;
	dateLabel: string | null;
	timeLabel: string | null;
	location: string;
	deadlineLabel: string | null;
};

// Carriers require the sender to be named and an opt-out in marketing-ish
// texts. The free-text pieces are bounded so a whole text stays within a few
// segments, since every segment is billed and a host can type anything.
const BRAND = "Botch RSVP: ";
const STOP = " Reply STOP to opt out.";
const MAX_CHANGES = 3;
const MAX_LINES = 8;

function clip(text: string, max: number): string {
	const flat = toGsm(text).replace(/\s+/g, " ").trim();
	return flat.length <= max ? flat : `${flat.slice(0, max - 3).trimEnd()}...`;
}

function finish(body: string, stop = true): string {
	return toGsm(`${BRAND}${body}${stop ? STOP : ""}`);
}

function title(f: TextFacts): string {
	return clip(f.title, 60);
}

/** "Halloween Party, Sat, Oct 31 at 7:00 PM". */
function what(f: TextFacts): string {
	const when = [f.dateLabel, f.timeLabel?.split(" - ")[0]]
		.filter(Boolean)
		.join(" at ");
	return when ? `${title(f)}, ${when}` : title(f);
}

function where(f: TextFacts): string {
	return f.location.trim() ? clip(f.location, 60) : "";
}

export function inviteText(
	f: TextFacts,
	link: string,
	invitedBy?: string | null,
): string {
	const who = invitedBy?.trim()
		? `${clip(invitedBy, 40)} invited you along to`
		: f.hostName.trim()
			? `${clip(f.hostName, 40)} invited you to`
			: "You're invited to";
	return finish(`${who} ${what(f)}. See the invitation and RSVP: ${link}`);
}

export function nudgeText(f: TextFacts, link: string): string {
	return finish(`You haven't answered for ${what(f)} yet. RSVP: ${link}`);
}

export function deadlineReminderText(f: TextFacts, link: string): string {
	const by = f.deadlineLabel ? ` by ${f.deadlineLabel}` : " soon";
	return finish(`Please RSVP${by} for ${what(f)}: ${link}`);
}

export function dayBeforeText(f: TextFacts, link: string): string {
	const place = where(f);
	return finish(
		`Tomorrow: ${title(f)}${f.timeLabel ? ` at ${f.timeLabel.split(" - ")[0]}` : ""}${place ? `, ${place}` : ""}. Details: ${link}`,
	);
}

export function updateText(
	f: TextFacts,
	changes: { label: string; was: string; now: string }[],
	link: string,
): string {
	const shown = changes
		.slice(0, MAX_CHANGES)
		.map((c) => `${clip(c.label, 20)} is now ${clip(c.now, 60)}`)
		.join("; ");
	const more =
		changes.length > MAX_CHANGES
			? ` (+${changes.length - MAX_CHANGES} more)`
			: "";
	return finish(`Update for ${title(f)}: ${shown}${more}. ${link}`);
}

export function cancelText(f: TextFacts, note: string, link: string): string {
	const extra = note.trim() ? ` ${clip(note, 160)}` : "";
	return finish(`${title(f)} has been canceled.${extra} ${link}`);
}

export function hostAlertText(
	a: {
		title: string;
		guestName: string;
		answer: string;
		party: string | null;
	},
	link: string,
): string {
	const party = a.party ? ` (${clip(a.party, 40)})` : "";
	return finish(
		`${clip(a.guestName, 40)} answered ${clip(a.answer, 20)}${party} for ${clip(a.title, 60)}. Guest list: ${link}`,
	);
}

export function hostDigestText(
	d: { title: string; lines: string[]; more: number },
	link: string,
): string {
	const lines = d.lines.slice(0, MAX_LINES).map((l) => clip(l, 50));
	const more = d.more + Math.max(0, d.lines.length - MAX_LINES);
	const tail = more > 0 ? `\n+${more} more` : "";
	return finish(
		`New replies for ${clip(d.title, 60)}:\n${lines.join("\n")}${tail}\n${link}`,
	);
}

export function signInText(people: { name: string; link: string }[]): string {
	const body =
		people.length === 1
			? `your sign-in link: ${people[0]?.link ?? ""}`
			: `sign-in links:\n${people.map((p) => `${clip(p.name, 40)}: ${p.link}`).join("\n")}`;
	return finish(`${body}\nDidn't ask? Ignore this.`, false);
}

export function replyText(): string {
	return toGsm(
		"Botch RSVP can't read replies. Use the link in your invitation to answer, or text HELP for help. Reply STOP to opt out.",
	);
}

export function testText(): string {
	return finish("this is a test text. Texting is working.");
}

/** Where a texted sign-in code lands; the code is a bearer credential. */
export function textLinkUrl(origin: string, code: string): string {
	return `${origin}/t/${code}`;
}
