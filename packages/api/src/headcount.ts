/**
 * The numbers every screen and email about an event shows. Pure, so the
 * dashboard card, the guest list, the invite page and the host digest
 * cannot disagree about how many people are coming.
 */

import type { GuestResponse } from "@rsvp-site/db/schema/event";

export type Answer = GuestResponse;

export type GuestCounts = {
	response: Answer | null;
	adults: number;
	kids: number;
};

export type Totals = {
	/** Invitations (rows on the list), answered or not. */
	invited: number;
	yes: number;
	maybe: number;
	no: number;
	/** Invited and not answered yet. */
	waiting: number;
	/** People coming: adults and kids on every yes. Maybes count for nothing. */
	adults: number;
	kids: number;
};

export function tally(guests: readonly GuestCounts[]): Totals {
	const t: Totals = {
		invited: guests.length,
		yes: 0,
		maybe: 0,
		no: 0,
		waiting: 0,
		adults: 0,
		kids: 0,
	};
	for (const g of guests) {
		if (g.response === null) {
			t.waiting++;
			continue;
		}
		t[g.response]++;
		if (g.response === "yes") {
			// A yes is at least one person. A child a relative answered for is
			// stored as 0 adults and 1 kid, so the floor is on the sum.
			const adults = Math.max(0, g.adults);
			const kids = Math.max(0, g.kids);
			if (adults + kids < 1) t.adults += 1;
			else {
				t.adults += adults;
				t.kids += kids;
			}
		}
	}
	return t;
}

/** Everybody expected through the door. */
export function headcount(t: Totals): number {
	return t.adults + t.kids;
}

/** Invitations still to be heard from for certain: no reply, or a maybe. */
export function deciding(t: Totals): number {
	return t.waiting + t.maybe;
}

/**
 * Guests who have the invitation and have not said no, for telling about a
 * change or a cancellation. Same rule as the `stillComing` query.
 */
export function stillComingCount(
	guests: readonly { invitedAt: Date | null; response: Answer | null }[],
): number {
	return guests.filter((g) => g.invitedAt !== null && g.response !== "no")
		.length;
}

/** Guests the next Send would email: not yet invited, and mail can reach them. */
export function notInvitedCount(
	guests: readonly { invitedAt: Date | null; unreachable: boolean }[],
): number {
	return guests.filter((g) => g.invitedAt === null && !g.unreachable).length;
}

export type PotluckLine = {
	id: string;
	label: string;
	quantity: number;
	claimed: number;
	/** Never negative, even if a host lowers the quantity after claims. */
	left: number;
};

export function potluckLines(
	items: readonly { id: string; label: string; quantity: number }[],
	claims: readonly { itemId: string }[],
): PotluckLine[] {
	const counts = new Map<string, number>();
	for (const c of claims) counts.set(c.itemId, (counts.get(c.itemId) ?? 0) + 1);
	return items.map((item) => {
		const claimed = counts.get(item.id) ?? 0;
		return { ...item, claimed, left: Math.max(0, item.quantity - claimed) };
	});
}

/** Open slots across every item, for the dashboard tile. */
export function openSlots(lines: readonly PotluckLine[]): number {
	return lines.reduce((sum, line) => sum + line.left, 0);
}

/**
 * What a line shows as left while a guest is choosing: the server's count
 * already has their saved claim taken out, so give it back and charge the
 * box as it is now ticked.
 */
export function slotsLeftFor(
	line: Pick<PotluckLine, "left">,
	claimed: { saved: boolean; ticked: boolean },
): number {
	return line.left + (claimed.saved ? 1 : 0) - (claimed.ticked ? 1 : 0);
}

/** People who come along with a guest who said yes, not counting them. */
export function extraPeople(party: { adults: number; kids: number }): number {
	return Math.max(0, party.adults + party.kids - 1);
}

/**
 * Clamp what a guest sent to what the event allows. The form enforces the
 * same limits; this is what makes them true. `maxPlusOnes` 0 means the
 * guest comes alone; kids are dropped when the event does not ask. A child
 * answering on their own form counts as an adult here: only a relative's
 * answer (`relativeParty`) knows them as a kid.
 */
export function clampParty(
	input: { adults: number; kids: number },
	rules: { maxPlusOnes: number; askKids: boolean },
): { adults: number; kids: number } {
	const adults = Math.min(
		Math.max(1, Math.trunc(input.adults)),
		1 + Math.max(0, rules.maxPlusOnes),
	);
	const kids = rules.askKids
		? Math.min(Math.max(0, Math.trunc(input.kids)), 20)
		: 0;
	return { adults, kids };
}

/**
 * What a relative's answer stands for: that one person, no plus-ones. A
 * child is a kid when the event asks about kids, and otherwise counted like
 * everybody else.
 */
export function relativeParty(
	child: boolean,
	askKids: boolean,
): { adults: number; kids: number } {
	return child && askKids ? { adults: 0, kids: 1 } : { adults: 1, kids: 0 };
}
