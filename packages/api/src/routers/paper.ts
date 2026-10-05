import { ORPCError } from "@orpc/server";
import type { Db } from "@rsvp-site/db";
import { relativesOnEvent } from "@rsvp-site/db/families";
import { findPaperInvite } from "@rsvp-site/db/paper";
import { z } from "zod";
import { answer, answerInput } from "../answers";
import { contactInput, fillContact } from "../contact-ask";
import { dietsInput, saveDiets } from "../diet";
import { type Access, type Addressee, findEvent, notFound } from "../events";
import { publicProcedure } from "../index";
import { recordView } from "../views";
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
			const page = await invitePayload(context.db, who, access, "card");
			// Inviting a friend sends email in the guest's name and needs
			// them signed in; the card only answers.
			return {
				...page,
				me: page.me ? { ...page.me, canInvite: false } : null,
			};
		}),

	/**
	 * The card's guest has its page on screen. The key is the only
	 * authority here, as it is for answering; whoever holds the card is
	 * taken to be its guest.
	 */
	viewed: publicProcedure
		.input(tokenInput)
		.handler(async ({ context, input }) => {
			const { access } = await paperAccess(context.db, input.token);
			await recordView(context.db, access, "paper");
			return { ok: true as const };
		}),

	/** Answer the invitation behind a QR code. */
	respond: publicProcedure
		.input(tokenInput.merge(answerInput))
		.handler(async ({ context, input }) => {
			const { access, who } = await paperAccess(context.db, input.token);
			return answer(context.db, access, who, input, "paper");
		}),

	/**
	 * Fill the blanks on the card's guest: only those a host could fill,
	 * on a record nobody has signed in to (`contactGaps` with "card"). A
	 * yes to texts counts as the word of whoever put them on the list.
	 */
	addContact: publicProcedure
		.input(tokenInput.merge(contactInput))
		.handler(async ({ context, input }) => {
			// Anybody holding a card can try an address, and each try sends
			// an email, so the same limit as the sign-in doors, per caller.
			const ip = context.headers.get("cf-connecting-ip") ?? "local";
			const { success } = await context.env.AUTH_LIMITER.limit({
				key: `contact:${ip}`,
			});
			if (!success) {
				throw new ORPCError("TOO_MANY_REQUESTS", {
					message: "Slow down a little, then try again.",
				});
			}
			const { access, who } = await paperAccess(context.db, input.token);
			if (access.event.status === "canceled") throw notFound();
			const { token: _, ...details } = input;
			// A host's own adds carry their id; a friend a guest invited
			// carries the guest's, whose word is not a host's.
			const guest = access.guest;
			const voucher =
				guest && (guest.source === "host" || guest.source === "group")
					? (guest.addedBy ?? access.event.createdBy)
					: access.event.createdBy;
			return fillContact(
				context.db,
				context.env.BETTER_AUTH_SECRET,
				who.id,
				details,
				"card",
				voucher,
			);
		}),

	/**
	 * Set or confirm diets from a card: its guest's own, and those of the
	 * relatives on the same list -- whom the card may already answer for.
	 * Not limited to blanks like `addContact`: a diet is no way in.
	 */
	saveDiet: publicProcedure
		.input(tokenInput.merge(dietsInput))
		.handler(async ({ context, input }) => {
			const { access, who } = await paperAccess(context.db, input.token);
			if (access.event.status === "canceled") throw notFound();
			const relatives = await relativesOnEvent(
				context.db,
				access.event.id,
				who.id,
			);
			const allowed = new Set([who.id, ...relatives.map((r) => r.userId)]);
			return saveDiets(
				context.db,
				input,
				{ admin: false, userId: who.id },
				allowed,
			);
		}),
};
