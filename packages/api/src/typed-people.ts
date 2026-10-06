import { ORPCError } from "@orpc/server";
import type { Db } from "@rsvp-site/db";
import { type ParsedGuest, parseGuests } from "@rsvp-site/db/addresses";
import {
	createNameOnlyPeople,
	findOrCreatePeople,
	nameOnlyFromBook,
} from "@rsvp-site/db/people";
import type { PersonSource } from "@rsvp-site/db/schema/auth";
import { vouchForTexts } from "@rsvp-site/db/sms-status";

export type TypedOptions = {
	source: PersonSource;
	/** Who is typing: as `findOrCreatePeople`'s `by`, so a host fills blanks only where a host may. */
	by: { id: string; host: boolean };
	/** Which lines with a name and no address become people; the rest are dropped. */
	keepName: (line: ParsedGuest) => boolean;
	/**
	 * Name-only people are looked up in this person's book by phone first
	 * (`nameOnlyFromBook`); absent, every one is a new person.
	 */
	bookOwnerId?: string;
	/** Refuse the request, with this message, if any name-only line is kept. */
	refuseNames?: string;
	/**
	 * The most one request may add. `extra` is whatever else the caller
	 * counts toward it (picks); checked before anybody is created, so a
	 * refused request leaves no accounts behind.
	 */
	cap: { max: number; extra?: number; message: (total: number) => string };
};

/**
 * What a host typed into people: addresses become accounts, name-only lines
 * become name-only people, and anybody deactivated is dropped (`refused`).
 * Callers decide the rest -- whose book remembers them, and the texting
 * consent through `vouch` -- because those differ by who is adding whom.
 */
export async function typedPeople(db: Db, raw: string, opts: TypedOptions) {
	const parsed = parseGuests(raw);
	const emailed = parsed.flatMap((t) =>
		t.email ? [{ ...t, email: t.email }] : [],
	);
	const names = parsed.filter((t) => !t.email && opts.keepName(t));
	if (opts.refuseNames && names.length > 0) {
		throw new ORPCError("BAD_REQUEST", { message: opts.refuseNames });
	}
	const total = emailed.length + names.length + (opts.cap.extra ?? 0);
	if (total > opts.cap.max) {
		throw new ORPCError("BAD_REQUEST", { message: opts.cap.message(total) });
	}
	const [found, named] = await Promise.all([
		findOrCreatePeople(db, emailed, opts.source, opts.by),
		opts.bookOwnerId
			? nameOnlyFromBook(db, opts.bookOwnerId, names, opts.source)
			: createNameOnlyPeople(db, names, opts.source, opts.by.id).then((made) =>
					made.map((m, i) => ({ ...m, phone: names[i]?.phone ?? null })),
				),
	]);
	const people = found.filter((p) => p.status !== "deactivated");
	const phoned = new Set(emailed.flatMap((t) => (t.phone ? [t.email] : [])));
	return {
		people,
		named,
		/** Every id the lines came to, addresses first. */
		ids: [...people, ...named].map((p) => p.id),
		created: found.filter((p) => p.created).length + named.length,
		refused: found.length - people.length,
		/** Lines that became somebody, or would have: none of a non-empty paste means nothing parsed. */
		lineCount: emailed.length + names.length,
		/** The host's word that people they typed a number for expect a text. */
		vouch: (hostId: string) =>
			vouchForTexts(
				db,
				[
					...people.filter((p) => phoned.has(p.email)).map((p) => p.id),
					...named.filter((p) => p.phone).map((p) => p.id),
				],
				hostId,
			),
	};
}
