import { ORPCError } from "@orpc/server";
import type { Db } from "@rsvp-site/db";
import type { Person } from "@rsvp-site/db/people";
import { formatPhone, textablePhone } from "@rsvp-site/db/phone";
import { CONTACT_CHANNELS } from "@rsvp-site/db/schema/auth";
import { blockOf, setContactPrefs, setTexts } from "@rsvp-site/db/sms-status";
import { resubscribe, unsubscribe } from "@rsvp-site/db/status";
import { getMailer } from "@rsvp-site/email/worker";
import { textingFrom } from "@rsvp-site/sms/worker";
import { z } from "zod";

/** "How we reach you": only the fields sent are written. */
export const reachInput = z.object({
	email: z.boolean().optional(),
	texts: z.boolean().optional(),
	contactBy: z.enum(CONTACT_CHANNELS).nullable().optional(),
	alertsBy: z.enum(CONTACT_CHANNELS).nullable().optional(),
});

/** Where somebody's texting settings stand, for the account page. */
export async function textingOf(db: Db, person: Person) {
	const phone = textablePhone(person.phone);
	return {
		contactBy: person.contactBy,
		alertsBy: person.alertsBy,
		/** Their number is one this site can text. */
		textablePhone: phone !== null,
		textsOn: person.textsOkAt !== null && person.textsOffAt === null,
		textBlock: await blockOf(db, phone),
		/** The number to text START to, after a STOP. */
		textingFrom: formatPhone(textingFrom()),
	};
}

/**
 * Save "How we reach you", for the person or an admin on their behalf
 * (`by` is whoever is saving). Email and texts stay separate permissions
 * (a STOP reply must not touch email, an unsubscribe must not touch texts).
 * Turning email back on also lifts Brevo's blocklist, or the account would
 * read as subscribed and stay quietly undeliverable. Texts on is recorded
 * as `by`'s word, so an admin's is never mistaken for the person's own; a
 * STOP from the phone is the number's and only START lifts it.
 */
export async function saveReach(
	db: Db,
	person: Person,
	input: z.infer<typeof reachInput>,
	by: string,
): Promise<void> {
	const self = by === person.id;
	// Refused before anything is written, so a Save is all or nothing here.
	if (input.texts && !textablePhone(person.phone)) {
		throw new ORPCError("BAD_REQUEST", {
			message: self
				? "Add a US mobile number first."
				: "They need a US mobile number first.",
		});
	}
	if (input.email === true) {
		await resubscribe(db, person.id);
		// A name-only guest's address reads blank; there is nothing to unblock.
		if (person.email) await getMailer().unblock(person.email);
	} else if (input.email === false) {
		await unsubscribe(db, { id: person.id }, self ? "self" : "admin");
	}
	if (input.texts !== undefined) {
		await setTexts(db, person.id, input.texts, by);
	}
	await setContactPrefs(db, person.id, {
		contactBy: input.contactBy,
		alertsBy: input.alertsBy,
	});
}
