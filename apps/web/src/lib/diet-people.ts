import { isComing } from "@rsvp-site/api/headcount";
import type { DietId } from "@rsvp-site/db/diets";

import type { RsvpValues } from "@/components/invite/rsvp-form";
import type { Invite } from "@/components/invite/types";

/** Somebody whose diet the panel checks: the guest, or a relative they answered for. */
export type DietPerson = {
	userId: string;
	name: string;
	you: boolean;
	child: boolean;
	diet: { diets: DietId[]; note: string; confirmed: boolean };
};

export type DietSave = { userId: string; diets: DietId[]; note: string }[];

/**
 * Whose diets to check after an answer: the guest if they're coming, and
 * each relative who now is. Decided from what was just sent, since the
 * page's copy of the answers refreshes only after the panel opens.
 */
export function dietPeople(
	me: NonNullable<Invite["me"]>,
	askDietary: boolean,
	sent: RsvpValues,
): DietPerson[] {
	if (!askDietary) return [];
	const sentFor = new Map(sent.family.map((f) => [f.guestId, f.response]));
	return [
		...(isComing(sent.response)
			? [
					{
						userId: me.userId,
						name: "You",
						you: true,
						child: false,
						diet: me.diet,
					},
				]
			: []),
		...me.family
			.filter((r) => isComing(sentFor.get(r.guestId) ?? r.response))
			.map((r) => ({
				userId: r.userId,
				name: r.name,
				you: false,
				child: r.child,
				diet: r.diet,
			})),
	];
}
