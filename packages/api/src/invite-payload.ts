import type { Db } from "@rsvp-site/db";
import { contactGaps, type FilledBy, NO_GAPS } from "@rsvp-site/db/details";
import type { DietId } from "@rsvp-site/db/diets";
import { relativesOnEvent } from "@rsvp-site/db/families";
import { firstNameOf } from "@rsvp-site/db/names";
import { answersOf } from "./answer-words";
import {
	type Access,
	type Addressee,
	designedCard,
	guestsOf,
	hostsOf,
	labelsOf,
	NO_POTLUCK,
	potluckOf,
	YOUR_GUEST,
} from "./events";
import { inviteRefusal, invitesLeft } from "./guest-invites";
import { headcount, tally } from "./headcount";
import { startsAt } from "./schedule";

/**
 * The page a guest sees. Hosts see the same page, as a guest would, and
 * get the controls from the guest list and the editor. `by` is how the
 * viewer came: signed in, or holding a printed card, which decides which
 * blanks in their contact details they may be asked to fill.
 */
export async function invitePayload(
	db: Db,
	me: Addressee & { id: string },
	access: Access,
	by: FilledBy,
) {
	const row = access.event;
	// The card says the viewer's own name, which is the caller's: so the
	// layout needs nothing from the other reads and runs beside them.
	const [guests, potluck, hosts, card, relatives, missing] = await Promise.all([
		guestsOf(db, row.id, { diets: row.askDietary }),
		row.potluckEnabled ? potluckOf(db, row.id) : NO_POTLUCK,
		hostsOf(db, row.id),
		designedCard(db, row, "web", access.guest ? me : YOUR_GUEST),
		access.guest ? relativesOnEvent(db, row.id, access.guest.userId) : [],
		access.guest ? contactGaps(db, access.guest.userId, by) : NO_GAPS,
	]);
	const totals = tally(guests);
	const mine = access.guest;
	const myFriends = mine
		? guests.filter((g) => g.source === "guest" && g.addedBy === mine.userId)
		: [];
	// The relatives this guest may answer for, as the guest list has them.
	const childOf = new Map(relatives.map((r) => [r.id, r.child]));
	const myFamily = guests.filter((g) => childOf.has(g.id));
	const myRow = mine ? guests.find((g) => g.id === mine.id) : undefined;
	const dietOf = (g?: {
		diets: DietId[];
		dietNote: string;
		dietConfirmed: boolean;
	}) => ({
		diets: g?.diets ?? [],
		note: g?.dietNote ?? "",
		confirmed: g?.dietConfirmed ?? false,
	});
	const myClaims = mine
		? (potluck.byGuest.get(mine.id) ?? []).map((c) => c.itemId)
		: [];
	const names = (answer: "yes" | "maybe") =>
		row.showGuestNames
			? guests.filter((g) => g.response === answer).map((g) => g.name)
			: [];
	const start = startsAt(row);
	return {
		now: new Date().toISOString(),
		startsAt: start?.toISOString() ?? null,
		isHost: access.isHost,
		canDelete: access.canDelete,
		event: {
			id: row.id,
			title: row.title,
			hostLine: row.hostLine,
			status: row.status,
			date: row.date,
			startTime: row.startTime,
			endTime: row.endTime,
			location: row.location,
			details: row.details,
			extraDetails: row.extraDetails,
			coverKey: row.coverKey,
			rsvpDeadline: row.rsvpDeadline,
			maxPlusOnes: row.maxPlusOnes,
			askKids: row.askKids,
			askDietary: row.askDietary,
			askNote: row.askNote,
			potluckEnabled: row.potluckEnabled,
			showGuestNames: row.showGuestNames,
			guestInviteLimit: row.guestInviteLimit,
			...labelsOf(row),
		},
		answers: answersOf(row),
		design: card && row.theme ? { scene: card.scene, theme: row.theme } : null,
		hosts: hosts.map((h) => ({ id: h.id, name: h.name })),
		me: mine
			? {
					guestId: mine.id,
					response: mine.response,
					adults: mine.adults,
					kids: mine.kids,
					partyDiet: row.askDietary ? mine.partyDiet : "",
					/** Their own diet, for the "still right?" after answering. */
					diet: dietOf(myRow),
					userId: mine.userId,
					note: mine.note,
					claims: myClaims,
					name: me.name,
					firstName: firstNameOf(me),
					friends: myFriends.map((g) => ({
						guestId: g.id,
						name: g.name,
						email: g.email,
						response: g.response,
					})),
					family: myFamily.map((g) => ({
						guestId: g.id,
						userId: g.userId,
						name: g.name,
						child: childOf.get(g.id) === true,
						diet: dietOf(g),
						response: g.response,
						answeredByName: g.answeredByName,
					})),
					// Asked here rather than on the page, so the form shows only when
					// the API would take it: the same rule `guests.inviteFriend` applies.
					canInvite: inviteRefusal(row, mine) === null,
					invitesLeft: invitesLeft(row.guestInviteLimit, mine.invitesSent),
					/** What to ask for once they've answered. */
					missing,
				}
			: null,
		viewerId: me.id,
		// What a guest the hosts chose would be offered, for a host who is
		// not on the list and sees the page as one. Guests have `canInvite`.
		guestsMayInvite:
			access.isHost && inviteRefusal(row, { source: "host" }) === null,
		totals,
		headcount: headcount(totals),
		crowd: { yes: names("yes"), maybe: names("maybe") },
		potluck: potluck.lines.map((line) => ({
			...line,
			mine: myClaims.includes(line.id),
		})),
	};
}
