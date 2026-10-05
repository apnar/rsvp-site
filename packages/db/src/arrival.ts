/**
 * How a signed-in guest got here, carried from the link they clicked to the
 * page that records their view and their answer. Pure, so the sign-in link
 * that sets it and the procedures that read it agree on one name.
 *
 * A cookie rather than a query parameter: the link may land anywhere on the
 * site, a parameter is lost on the first click away from that page, and a
 * bookmarked or shared `?via=email` would keep claiming an email long after.
 * It lives a couple of hours, the length of a visit: a guest who comes back
 * the next day by typing the address came directly, whatever brought them
 * the first time. It says nothing anybody could use, so a guest who forges
 * it only mislabels their own row.
 */
import type { Arrival } from "./schema/event";

export const ARRIVAL_COOKIE = "arrived_via";
export const ARRIVAL_MAX_AGE = 2 * 60 * 60;

/** The links that set the cookie. */
export const LINK_ARRIVALS = ["email", "text"] as const satisfies Arrival[];
export type LinkArrival = (typeof LINK_ARRIVALS)[number];

/** How the request's sender came, from its Cookie header: a link, or directly. */
export function arrivalOf(headers: Headers): Arrival {
	for (const part of (headers.get("cookie") ?? "").split(";")) {
		const [name, value] = part.trim().split("=");
		if (name === ARRIVAL_COOKIE) {
			return LINK_ARRIVALS.find((a) => a === value) ?? "direct";
		}
	}
	return "direct";
}
