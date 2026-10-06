import {
	claimState,
	confirmClaim,
	contactInput,
	fillContact,
} from "../contact-ask";
import { personProcedure, publicProcedure } from "../index";
import { signedTokenInput } from "../inputs";
import { requireUnderLimit } from "../limits";

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
			await requireUnderLimit(
				context.env.AUTH_LIMITER,
				`contact:${context.me.id}`,
			);
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
		.input(signedTokenInput)
		.handler(({ context, input }) =>
			claimState(context.db, context.env.BETTER_AUTH_SECRET, input.token),
		),

	/** The address's owner pressed the button: add it. */
	confirm: publicProcedure
		.input(signedTokenInput)
		.handler(({ context, input }) =>
			confirmClaim(context.db, context.env.BETTER_AUTH_SECRET, input.token),
		),
};
