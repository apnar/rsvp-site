import { ORPCError } from "@orpc/server";
import { z } from "zod";

import {
	claimState,
	confirmClaim,
	contactInput,
	fillContact,
} from "../contact-ask";
import { personProcedure, publicProcedure } from "../index";

const tokenInput = z.object({ token: z.string().min(1).max(1024) });

/**
 * A guest with no address or no number on file, asked for it after they
 * answer. A printed card's guest goes through `paper.addContact` instead.
 */
export const contactRouter = {
	/** Fill the caller's own blanks. An address gets a confirmation link. */
	add: personProcedure
		.input(contactInput)
		.handler(async ({ context, input }) => {
			// Each try can send an email to any address typed, so it shares
			// AUTH_LIMITER's 10 a minute per person, which no honest guest reaches.
			const { success } = await context.env.AUTH_LIMITER.limit({
				key: `contact:${context.me.id}`,
			});
			if (!success) {
				throw new ORPCError("TOO_MANY_REQUESTS", {
					message: "Slow down a little, then try again.",
				});
			}
			return fillContact(
				context.db,
				context.env.BETTER_AUTH_SECRET,
				context.me.id,
				input,
				"self",
				null,
			);
		}),

	/** Where a confirmation link stands. A read; the button below writes. */
	claim: publicProcedure
		.input(tokenInput)
		.handler(({ context, input }) =>
			claimState(context.db, context.env.BETTER_AUTH_SECRET, input.token),
		),

	/** The address's owner pressed the button: add it. */
	confirm: publicProcedure
		.input(tokenInput)
		.handler(({ context, input }) =>
			confirmClaim(context.db, context.env.BETTER_AUTH_SECRET, input.token),
		),
};
