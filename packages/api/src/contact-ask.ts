import { ORPCError } from "@orpc/server";
import type { Db } from "@rsvp-site/db";
import { normalizeEmail } from "@rsvp-site/db/addresses";
import {
	claimEmail,
	contactGaps,
	type FilledBy,
	fillPhone,
} from "@rsvp-site/db/details";
import { findPerson } from "@rsvp-site/db/people";
import { normalizePhone, textablePhone } from "@rsvp-site/db/phone";
import { alsoByText, setTexts, vouchForTexts } from "@rsvp-site/db/sms-status";
import { confirmEmailEmail } from "@rsvp-site/email";
import { getMailer, siteUrl } from "@rsvp-site/email/worker";
import { z } from "zod";

import { CLAIM_TTL_MS, readEmailClaim, signEmailClaim } from "./email-claim";
import { emailSchema } from "./inputs";

/**
 * What a guest gives after answering, when we have no address or no number
 * for them. `texts` is their yes to texts, which needs a number we can text.
 */
export const contactInput = z.object({
	// Checked in the handler, so a typo gets its own words in the toast
	// rather than the generic "Input validation failed".
	phone: z.string().trim().max(40).optional(),
	texts: z.boolean().default(false),
	email: emailSchema.optional(),
});

export type ContactInput = z.infer<typeof contactInput>;

/**
 * Fill the blanks a guest was asked about. A number is written at once.
 * An address is not: it would become a way into this record, so it is
 * only sent a link, and is added when its owner presses the button there
 * (`confirmClaim`). Checked whole before anything is written, so a bad
 * number doesn't leave a confirmation email behind it.
 *
 * `voucher` is whose word a card's yes to texts counts as: the card holder
 * is taken to be the guest, but the key is the host's, so it is recorded
 * the way a host's tick is, and goes if the number later changes.
 */
export async function fillContact(
	db: Db,
	secret: string,
	userId: string,
	input: ContactInput,
	by: FilledBy,
	voucher: string | null,
): Promise<{ phone: boolean; emailTo: string | null }> {
	const number = input.phone ? normalizePhone(input.phone) : null;
	if (input.phone && !number) {
		throw new ORPCError("BAD_REQUEST", {
			message: "That doesn't look like a phone number.",
		});
	}
	const gaps = await contactGaps(db, userId, by);
	// A card sees no gaps on a record somebody has signed in to: it may
	// fill only what a host could.
	const refusal = (what: string) =>
		new ORPCError("BAD_REQUEST", {
			message:
				by === "card"
					? "Only they can change their details now."
					: `There's ${what} on file already.`,
		});
	if (number && !gaps.phone) throw refusal("a number");
	if (input.email && !gaps.email) throw refusal("an email address");
	if (number && input.texts && !textablePhone(number)) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Texts need a US mobile number.",
		});
	}

	let phone = false;
	if (number) {
		phone = await fillPhone(db, userId, number, by);
		if (phone && input.texts) {
			const consented =
				by === "self"
					? await setTexts(db, userId, true)
					: voucher !== null &&
						(await vouchForTexts(db, [userId], voucher)).length > 0;
			if (consented) await alsoByText(db, userId);
		}
	}

	let emailTo: string | null = null;
	if (input.email) {
		emailTo = normalizeEmail(input.email);
		const token = await signEmailClaim(secret, {
			userId,
			email: emailTo,
			by,
			expires: Date.now() + CLAIM_TTL_MS,
		});
		const outcome = await getMailer().sendOne(
			{ email: emailTo, name: null },
			confirmEmailEmail({
				url: `${siteUrl()}/confirm-email?k=${encodeURIComponent(token)}`,
			}),
			{ tags: ["confirm-email"] },
		);
		if (!outcome.ok) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: phone
					? "Your number is saved, but the email didn't go. Try the address again in a bit."
					: "That email didn't go. Try again in a bit.",
			});
		}
	}
	return { phone, emailTo };
}

/** Where a confirmation link stands, for the page it opens. */
export type ClaimState = "ready" | "done" | "expired" | "invalid";

/**
 * What the link's page shows. A read: mail scanners open links, so the
 * address is added only by the button (`confirmClaim`).
 */
export async function claimState(
	db: Db,
	secret: string,
	token: string,
): Promise<{ state: ClaimState; email: string | null }> {
	const claim = await readEmailClaim(secret, token, Date.now());
	if (claim === null) return { state: "invalid", email: null };
	if (claim === "expired") return { state: "expired", email: null };
	const person = await findPerson(db, claim.userId);
	if (!person) return { state: "invalid", email: null };
	if (person.email === claim.email)
		return { state: "done", email: claim.email };
	const gaps = await contactGaps(db, claim.userId, claim.by);
	return { state: gaps.email ? "ready" : "invalid", email: claim.email };
}

/** The button on that page: put the address on the record. */
export async function confirmClaim(
	db: Db,
	secret: string,
	token: string,
): Promise<{ email: string }> {
	const claim = await readEmailClaim(secret, token, Date.now());
	if (claim === "expired") {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"That link ran out. Answer the invitation again to get a new one.",
		});
	}
	if (claim === null) {
		throw new ORPCError("BAD_REQUEST", {
			message: "That link isn't one of ours.",
		});
	}
	const outcome = await claimEmail(db, claim.userId, claim.email, claim.by);
	if (outcome === "taken") {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"That address already has its own account here, so it can't be added to this one. Ask the host to invite that address instead.",
		});
	}
	if (outcome === "refused") {
		throw new ORPCError("BAD_REQUEST", {
			message: "That link doesn't apply any more.",
		});
	}
	return { email: claim.email };
}
