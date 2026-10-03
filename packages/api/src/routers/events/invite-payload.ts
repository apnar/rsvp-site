import type { Db } from "@rsvp-site/db";

import {
	type accessTo,
	designedCard,
	guestsOf,
	hostsOf,
	labelsOf,
	potluckOf,
} from "../../events";
import { canInviteOthers, invitesLeft } from "../../guest-invites";
import { headcount, tally } from "../../headcount";
import { startsAt } from "../../schedule";

/** The page a guest sees. Hosts see the same page, with everything. */
export async function invitePayload(
	db: Db,
	me: { id: string },
	access: Awaited<ReturnType<typeof accessTo>>,
) {
	const row = access.event;
	const [guests, potluck, hosts] = await Promise.all([
		guestsOf(db, row.id),
		row.potluckEnabled
			? potluckOf(db, row.id)
			: Promise.resolve({ lines: [], claims: [] }),
		hostsOf(db, row.id),
	]);
	const myName = access.guest
		? (guests.find((g) => g.id === access.guest?.id)?.name ?? "")
		: "your guest";
	const card = await designedCard(db, row, "web", myName);
	const totals = tally(guests);
	const mine = access.guest;
	const myFriends = mine
		? guests.filter((g) => g.source === "guest" && g.addedBy === mine.userId)
		: [];
	const myClaims = mine
		? potluck.claims.filter((c) => c.guestId === mine.id).map((c) => c.itemId)
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
					name: guests.find((g) => g.id === mine.id)?.name ?? "",
					friends: myFriends.map((g) => ({
						guestId: g.id,
						name: g.name,
						email: g.email,
						response: g.response,
					})),
					// Asked here rather than on the page, so the form shows only when
					// the API would take it.
					canInvite:
						row.guestInvites &&
						row.status === "published" &&
						canInviteOthers(mine.source),
					invitesLeft: invitesLeft(row.guestInviteLimit, myFriends.length),
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
