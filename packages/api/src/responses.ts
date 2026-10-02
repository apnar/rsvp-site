/**
 * How well somebody answers the calls to play.
 *
 * Pure, and tallied in TypeScript for the same reason `audience.ts` is: the
 * list is tens of people and ten runs is a few hundred rows, against which a
 * grouped `left join` buys nothing and costs the one bug that shape is prone
 * to here -- a second matching row on one side quietly inflating the
 * denominator. Being pure is also what makes the arithmetic testable without
 * D1, and it is the arithmetic, not the reading, that is easy to get wrong.
 */

import type { RsvpResponse } from "@rsvp-site/db/schema/rsvp";

/**
 * How far back the record on /admin/users reaches. Ten runs is most of a
 * season of events: long enough that one missed week is not a verdict, short
 * enough that a man who has started turning up again looks like one.
 */
export const RESPONSE_WINDOW = 10;

export type ResponseRate = {
	/**
	 * Runs in the window this person was asked about at all -- the number the
	 * other three are out of. Somebody added last week is 0 of 1, not 0 of 10.
	 */
	of: number;
	/** Said in. */
	yes: number;
	/** Said anything: in, out or maybe. Out is an answer. */
	replied: number;
	/**
	 * Was stepped away when the ask went out, so no email reached them. Part
	 * of `of` rather than deducted from it, because "away for four of the last
	 * ten" is the fact an admin is actually looking for -- the alternative
	 * hides a two-month break behind a denominator that quietly shrank.
	 */
	onBreak: number;
};

/** Nobody has been asked anything yet. The shape a new row gets. */
export const NO_RESPONSES: ResponseRate = {
	of: 0,
	yes: 0,
	replied: 0,
	onBreak: 0,
};

/** One row of the snapshot stage 01 wrote: somebody it reckoned with. */
export type Invite = {
	gameId: string;
	userId: string;
	onBreak: boolean;
};

/** One answer somebody gave under their own name. Guests belong to nobody. */
export type Answer = {
	gameId: string;
	userId: string;
	response: RsvpResponse;
};

const key = (gameId: string, userId: string) => `${gameId}\u0000${userId}`;

/**
 * The record for everybody the given invites name, keyed by person.
 *
 * Counted off the invites, never off the roster as it stands today: the
 * snapshot is the only thing that knows who was on the list in March, and
 * counting the other way marks a newcomer down for runs nobody asked him
 * about.
 */
export function tallyResponses(
	invites: Invite[],
	answers: Answer[],
): Map<string, ResponseRate> {
	const said = new Map<string, RsvpResponse>();
	for (const answer of answers) {
		said.set(key(answer.gameId, answer.userId), answer.response);
	}

	const rates = new Map<string, ResponseRate>();
	for (const invite of invites) {
		const rate = rates.get(invite.userId) ?? { ...NO_RESPONSES };
		rate.of += 1;
		if (invite.onBreak) rate.onBreak += 1;
		const response = said.get(key(invite.gameId, invite.userId));
		if (response) {
			rate.replied += 1;
			if (response === "in") rate.yes += 1;
		}
		rates.set(invite.userId, rate);
	}
	return rates;
}
