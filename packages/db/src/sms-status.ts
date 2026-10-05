import { and, eq, inArray, isNull, ne } from "drizzle-orm";

import { mapChunks } from "./batch";
import type { Db } from "./index";
import { type ContactChannel, user } from "./schema/auth";
import { type SmsBlockReason, smsBlock } from "./schema/sms";

/**
 * Stop texting a number. A repeat keeps the first reason: a STOP followed
 * by Telnyx refusing the next send (40300) is still a STOP.
 */
export async function blockNumber(
	db: Db,
	phone: string,
	reason: SmsBlockReason,
): Promise<boolean> {
	const result = await db
		.insert(smsBlock)
		.values({ phone, reason })
		.onConflictDoNothing()
		.run();
	return result.meta.changes === 1;
}

/**
 * The phone said START. Only a STOP is lifted: a number a carrier called
 * a landline is still one, whatever it sends.
 */
export async function unblockNumber(db: Db, phone: string): Promise<boolean> {
	const result = await db
		.delete(smsBlock)
		.where(and(eq(smsBlock.phone, phone), eq(smsBlock.reason, "stop")))
		.run();
	return result.meta.changes === 1;
}

/** Why this number gets no texts, or null. */
export async function blockOf(
	db: Db,
	phone: string | null,
): Promise<SmsBlockReason | null> {
	if (!phone) return null;
	const row = await db
		.select({ reason: smsBlock.reason })
		.from(smsBlock)
		.where(eq(smsBlock.phone, phone))
		.get();
	return row?.reason ?? null;
}

/**
 * The person's own texts switch. On records their consent (by them) and
 * clears an earlier off; off keeps the consent on record but wins over it.
 * Like every self-service write, never a deactivated row.
 */
export async function setTexts(
	db: Db,
	userId: string,
	on: boolean,
): Promise<boolean> {
	const result = await db
		.update(user)
		.set(
			on
				? { textsOkAt: new Date(), textsOkBy: userId, textsOffAt: null }
				: { textsOffAt: new Date() },
		)
		.where(and(eq(user.id, userId), ne(user.status, "deactivated")))
		.run();
	return result.meta.changes === 1;
}

/**
 * A host vouching that these people expect a text from them. Only fills a
 * blank: it never overrides somebody who switched texts off, and a person
 * who has signed in speaks for themselves.
 */
export async function vouchForTexts(
	db: Db,
	userIds: readonly string[],
	hostId: string,
): Promise<string[]> {
	if (userIds.length === 0) return [];
	const done = await mapChunks(userIds, (slice) =>
		db
			.update(user)
			.set({ textsOkAt: new Date(), textsOkBy: hostId })
			.where(
				and(
					inArray(user.id, slice),
					isNull(user.textsOkAt),
					isNull(user.textsOffAt),
					isNull(user.claimedAt),
					ne(user.status, "deactivated"),
				),
			)
			.returning({ id: user.id }),
	);
	return done.map((r) => r.id);
}

/** How somebody wants invitations, and (for hosts) reply alerts. */
export async function setContactPrefs(
	db: Db,
	userId: string,
	prefs: {
		contactBy?: ContactChannel | null;
		alertsBy?: ContactChannel | null;
	},
): Promise<void> {
	const set: Partial<typeof user.$inferInsert> = {};
	if (prefs.contactBy !== undefined) set.contactBy = prefs.contactBy;
	if (prefs.alertsBy !== undefined) set.alertsBy = prefs.alertsBy;
	if (Object.keys(set).length === 0) return;
	await db
		.update(user)
		.set(set)
		.where(and(eq(user.id, userId), ne(user.status, "deactivated")));
}

/**
 * Texts as well as email, for somebody who has just given a number and
 * said yes to texts. Without a choice on record, anybody with an address
 * gets email only, and their yes would never be used. Fills a blank
 * choice; one they made stands.
 */
export async function alsoByText(db: Db, userId: string): Promise<void> {
	await db
		.update(user)
		.set({ contactBy: "both" })
		.where(and(eq(user.id, userId), isNull(user.contactBy)));
}
