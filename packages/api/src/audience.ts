/**
 * Who a cycle email reaches, worked out from the sheet and the list.
 *
 * Deliberately plain TypeScript rather than SQL. The list is tens of people
 * and `listRecipients` already has all of them in hand; against that, a
 * correlated NOT EXISTS off a single-table `from` is exactly the shape that
 * drizzle renders without table qualifiers -- `where "user_id" = "id"` -- and
 * that returns zeros without complaining. A pure function is also the only
 * version of this that can be unit-tested without a database.
 */

import type { RsvpResponse } from "@rsvp-site/db/schema/rsvp";

import { nameKeyOf } from "./run";

export type SheetRow = {
	name: string;
	nameKey: string;
	/** Whose row it is. Null for a guest somebody typed in. */
	userId: string | null;
	/** Who typed it in. Null on rows that predate the column. */
	addedBy: string | null;
	response: RsvpResponse;
};

export type Person = { id: string; name: string };

export type Split = {
	/** Yes count, guests included. This is the number the thresholds read. */
	yes: number;
	maybe: number;
	out: number;
	/** Active guests who have not answered and are not already on the sheet. */
	silent: number;
	inNames: string[];
	maybeNames: string[];
	inIds: string[];
	maybeIds: string[];
	silentIds: string[];
	silentNames: string[];
	/** Whoever typed in a guest who is in or maybe. They can pass word along. */
	sponsorIds: string[];
};

/**
 * Split the sheet against the active list.
 *
 * Guests count toward the totals -- a body in the room is a body -- but they
 * have no inbox, so they never appear in an id set.
 */
export function splitAudience(rows: SheetRow[], active: Person[]): Split {
	const ins = rows.filter((r) => r.response === "in");
	const maybes = rows.filter((r) => r.response === "maybe");

	const answeredIds = new Set(
		rows.map((r) => r.userId).filter((id): id is string => Boolean(id)),
	);
	// A name already on the sheet, even under a guest row somebody else typed
	// in, has answered as far as the nagging emails are concerned. Without
	// this, Dave -- visibly In because somebody put him down -- gets a 2 PM
	// email accusing him of saying nothing. Two Daves would collide and one
	// would miss a prod, which is much the better failure.
	const claimedNames = new Set(rows.map((r) => r.nameKey));
	const silent = active.filter(
		(p) => !answeredIds.has(p.id) && !claimedNames.has(nameKeyOf(p.name)),
	);

	const idsOf = (subset: SheetRow[]) =>
		subset.map((r) => r.userId).filter((id): id is string => Boolean(id));

	const sponsorIds = [
		...new Set(
			[...ins, ...maybes]
				.filter((r) => r.userId === null && r.addedBy)
				.map((r) => r.addedBy as string),
		),
	];

	return {
		yes: ins.length,
		maybe: maybes.length,
		out: rows.length - ins.length - maybes.length,
		silent: silent.length,
		inNames: ins.map((r) => r.name),
		maybeNames: maybes.map((r) => r.name),
		inIds: idsOf(ins),
		maybeIds: idsOf(maybes),
		silentIds: silent.map((p) => p.id),
		silentNames: silent.map((p) => p.name),
		sponsorIds,
	};
}

/** Unique ids, order preserved. */
export function union(...groups: string[][]): string[] {
	return [...new Set(groups.flat())];
}

/**
 * Names this person has brought before, for the box that asks who they are
 * bringing tonight. The same handful of guests come back week after week, and
 * retyping "Marcus Pritchard" every time is how you end up with two of him.
 *
 * TypeScript rather than a `group by`: the rows are one person's own history,
 * a few dozen at the outside, and the interesting part -- collapsing the same
 * guest typed three different ways and dropping whoever is already on tonight's
 * sheet -- is exactly what a bare column in a grouped select does badly.
 *
 * `rows` must arrive newest first; the order they come back in is the order
 * they were last brought.
 */
export function guestSuggestions(
	rows: { name: string; nameKey: string }[],
	onSheet: Iterable<string>,
	limit: number,
): string[] {
	const taken = new Set(onSheet);
	const out: string[] = [];
	for (const r of rows) {
		if (out.length >= limit) break;
		if (taken.has(r.nameKey)) continue;
		taken.add(r.nameKey);
		out.push(r.name);
	}
	return out;
}
