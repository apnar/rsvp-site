import type { Db } from "@rsvp-site/db";
import { relativesOnEvent } from "@rsvp-site/db/families";
import { firstNameOf } from "@rsvp-site/db/names";
import { answersOf } from "../../answer-words";
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
} from "../../events";
import { inviteRefusal, invitesLeft } from "../../guest-invites";
import { headcount, tally } from "../../headcount";
import { startsAt } from "../../schedule";

/** The page a guest sees. Hosts see the same page, with everything. */
export async function invitePayload(
	db: Db,
	me: Addressee & { id: string },
	access: Access,
) {
	const row = access.event;
	// The card says the viewer's own name, which is the caller's: so the
	// layout needs nothing from the other reads and runs beside them.
	const [guests, potluck, hosts, card, relatives] = await Promise.all([
		guestsOf(db, row.id),
		row.potluckEnabled ? potluckOf(db, row.id) : NO_POTLUCK,
		hostsOf(db, row.id),
		designedCard(db, row, "web", access.guest ? me : YOUR_GUEST),
		access.guest ? relativesOnEvent(db, row.id, access.guest.userId) : [],
	]);
	const totals = tally(guests);
	const mine = access.guest;
	const myFriends = mine
		? guests.filter((g) => g.source === "guest" && g.addedBy === mine.userId)
		: [];
	// The relatives this guest may answer for, as the guest list has them.
	const childOf = new Map(relatives.map((r) => [r.id, r.child]));
	const myFamily = guests.filter((g) => childOf.has(g.id));
	const myClaims = mine
		? (potluck.byGuest.get(mine.id) ?? []).map((c) => c.itemId)
		: [];
	const showNames = row.showGuestNames || access.isHost;
	const names = (answer: "yes" | "maybe") =>
		showNames
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
					dietary: mine.dietary,
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
						name: g.name,
						child: childOf.get(g.id) === true,
						response: g.response,
						answeredByName: g.answeredByName,
					})),
					// Asked here rather than on the page, so the form shows only when
					// the API would take it: the same rule `guests.inviteFriend` applies.
					canInvite: inviteRefusal(row, mine) === null,
					invitesLeft: invitesLeft(row.guestInviteLimit, mine.invitesSent),
				}
			: null,
		viewerId: me.id,
		totals,
		headcount: headcount(totals),
		crowd: { yes: names("yes"), maybe: names("maybe") },
		potluck: potluck.lines.map((line) => ({
			...line,
			mine: myClaims.includes(line.id),
		})),
	};
}
