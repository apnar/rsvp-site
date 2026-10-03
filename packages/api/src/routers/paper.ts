import type { Db } from "@rsvp-site/db";
import { findPaperInvite } from "@rsvp-site/db/paper";
import { z } from "zod";

import { answer, answerInput } from "../answers";
import { type Access, type Addressee, findEvent, notFound } from "../events";
import { publicProcedure } from "../index";
import { invitePayload } from "./events/invite-payload";

const tokenInput = z.object({ token: z.string().min(1).max(64) });

/**
 * A printed card's QR code opens its one invitation, and nothing else.
 *
 * The host holds these keys -- they print them -- so a key must not be a
 * way into the guest's account. It used to be: scanning signed the guest
 * in, so a host who put somebody's address on a paper event could open
 * the card themselves and be that person everywhere on the site. Now the
 * key reads and answers its own invitation and creates no session; for
 * anything else the guest signs in the ordinary way. Drafts, deactivated
 * people and replaced keys get the same "no such event" as a wrong key.
 */
async function paperAccess(
	db: Db,
	token: string,
): Promise<{ access: Access; who: Addressee & { id: string } }> {
	const found = await findPaperInvite(db, token);
	if (!found || found.status === "deactivated") throw notFound();
	const row = await findEvent(db, found.guest.eventId);
	if (!row || row.status === "draft") throw notFound();
	return {
		access: { event: row, isHost: false, canDelete: false, guest: found.guest },
		who: {
			id: found.guest.userId,
			name: found.name,
			firstName: found.firstName,
			lastName: found.lastName,
		},
	};
}

export const paperRouter = {
	/** The invitation behind a QR code, as its guest sees it. */
	invite: publicProcedure
		.input(tokenInput)
		.handler(async ({ context, input }) => {
			const { access, who } = await paperAccess(context.db, input.token);
			const page = await invitePayload(context.db, who, access);
			// Inviting a friend sends email in the guest's name and needs
			// them signed in; the card only answers.
			return {
				...page,
				me: page.me ? { ...page.me, canInvite: false } : null,
			};
		}),

	/** Answer the invitation behind a QR code. */
	respond: publicProcedure
		.input(tokenInput.merge(answerInput))
		.handler(async ({ context, input }) => {
			const { access, who } = await paperAccess(context.db, input.token);
			return answer(context.db, access, who, input);
		}),
};
