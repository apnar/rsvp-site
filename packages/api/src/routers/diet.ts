import { relativesOf } from "@rsvp-site/db/families";
import { isAdmin } from "@rsvp-site/db/roles";

import { dietsInput, saveDiets } from "../diet";
import { personProcedure } from "../index";

/**
 * What people eat, kept on the person rather than each answer. Anybody
 * sets their own; family members set each other's, since a parent
 * answering for a child is the only one who will. A printed card's guest
 * goes through `paper.saveDiet`, and hosts and admins through the details
 * forms (`contacts.update`, `people.update`).
 */
export const dietRouter = {
	/** Their relatives, with diets, for the account page. */
	family: personProcedure.handler(({ context }) =>
		relativesOf(context.db, context.me.id),
	),

	/** Set or confirm diets for themselves and their relatives. */
	save: personProcedure
		.input(dietsInput)
		.handler(async ({ context, input }) => {
			const me = context.me;
			if (isAdmin(me)) {
				return saveDiets(context.db, input, { admin: true }, "anyone");
			}
			const relatives = await relativesOf(context.db, me.id);
			const allowed = new Set([me.id, ...relatives.map((r) => r.id)]);
			return saveDiets(
				context.db,
				input,
				{ admin: false, userId: me.id },
				allowed,
			);
		}),
};
