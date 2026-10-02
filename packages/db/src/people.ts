import {
	and,
	asc,
	eq,
	gte,
	inArray,
	isNotNull,
	isNull,
	lte,
	ne,
	or,
} from "drizzle-orm";

import type { createDb } from "./index";
import {
	type PersonSource,
	type PersonStatus,
	type StatusActor,
	user,
} from "./schema/auth";
import { game } from "./schema/game";
import { rsvp } from "./schema/rsvp";

type Db = ReturnType<typeof createDb>;

/** The form every address is stored and looked up in. */
export function normalizeEmail(raw: string): string {
	return raw.trim().toLowerCase();
}

/** A fresh token: 32 hex characters, unguessable. */
export function newToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type PersonState = {
	id: string;
	email: string;
	name: string;
	status: PersonStatus;
	suspendedUntil: Date | null;
	statusReason: string | null;
};

/**
 * What a person's stored status actually means right now. A suspension with
 * a date in the past is simply over — nothing has to run for somebody to come
 * back, which is why a missed cron cannot strand anyone. `deactivated` never
 * expires: only an admin lifts it.
 */
export function effectiveStatus(
	row: Pick<PersonState, "status" | "suspendedUntil">,
	now: Date = new Date(),
): PersonStatus {
	if (
		row.status === "suspended" &&
		row.suspendedUntil &&
		row.suspendedUntil.getTime() <= now.getTime()
	) {
		return "active";
	}
	return row.status;
}

/**
 * Not thrown out of the group -- which is exactly who is on the roster, break
 * or no break. `banned` is nullable, so never compare it with `= 0`.
 */
export function notDeactivated() {
	return and(
		ne(user.status, "deactivated"),
		or(isNull(user.banned), eq(user.banned, false)),
	);
}

/** On the list right now: active, or a suspension whose date has passed. */
export function activeWhere(now: Date = new Date()) {
	return and(
		notDeactivated(),
		or(
			eq(user.status, "active"),
			and(
				eq(user.status, "suspended"),
				isNotNull(user.suspendedUntil),
				lte(user.suspendedUntil, now),
			),
		),
	);
}

export type Audience = "active" | "everyone";

/** Who a send of this audience would reach. Never anyone deactivated. */
export function audienceWhere(audience: Audience, now: Date = new Date()) {
	return audience === "everyone" ? notDeactivated() : activeWhere(now);
}

export type Person = {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	role: string | null;
	source: PersonSource;
	status: PersonStatus;
	suspendedUntil: Date | null;
	statusReason: string | null;
	statusChangedAt: Date | null;
	statusChangedBy: StatusActor | null;
	linkSentAt: Date | null;
	createdAt: Date;
};

const personColumns = {
	id: user.id,
	name: user.name,
	email: user.email,
	emailVerified: user.emailVerified,
	role: user.role,
	source: user.source,
	status: user.status,
	suspendedUntil: user.suspendedUntil,
	statusReason: user.statusReason,
	statusChangedAt: user.statusChangedAt,
	statusChangedBy: user.statusChangedBy,
	linkSentAt: user.linkSentAt,
	createdAt: user.createdAt,
};

/** Everybody, oldest first, with their status resolved for display. */
export async function listPeople(
	db: Db,
	now: Date = new Date(),
): Promise<(Person & { effectiveStatus: PersonStatus })[]> {
	const rows = await db
		.select(personColumns)
		.from(user)
		.orderBy(asc(user.createdAt))
		.all();
	return rows.map((row) => ({
		...row,
		effectiveStatus: effectiveStatus(row, now),
	}));
}

/**
 * Everybody still in the group and whether they are stepped away right now.
 *
 * The roster as the opening call finds it, which is what stage 01 writes down
 * so that a break can still be told from silence months later. Wider than
 * `listRecipients("active")` on purpose: the people on a break are the point.
 */
export async function listRosterState(
	db: Db,
	now: Date = new Date(),
): Promise<{ id: string; onBreak: boolean }[]> {
	const rows = await db
		.select({
			id: user.id,
			status: user.status,
			suspendedUntil: user.suspendedUntil,
		})
		.from(user)
		.where(notDeactivated())
		.orderBy(asc(user.createdAt))
		.all();
	return rows.map((row) => ({
		id: row.id,
		onBreak: effectiveStatus(row, now) === "suspended",
	}));
}

export type Recipient = {
	id: string;
	email: string;
	name: string | null;
	unsubscribeToken: string | null;
	linkToken: string | null;
};

/** Everyone the next list email should reach, oldest first. */
export async function listRecipients(
	db: Db,
	audience: Audience = "active",
	now: Date = new Date(),
): Promise<Recipient[]> {
	return db
		.select({
			id: user.id,
			email: user.email,
			name: user.name,
			unsubscribeToken: user.unsubscribeToken,
			linkToken: user.linkToken,
		})
		.from(user)
		.where(audienceWhere(audience, now))
		.orderBy(asc(user.createdAt))
		.all();
}

export type LinkPerson = {
	id: string;
	email: string;
	name: string;
	emailVerified: boolean;
	status: PersonStatus;
	suspendedUntil: Date | null;
	statusReason: string | null;
};

/** Who a sign-in link belongs to. Null when the token means nothing. */
export async function findPersonByLinkToken(
	db: Db,
	token: string,
): Promise<LinkPerson | null> {
	const row = await db
		.select({
			id: user.id,
			email: user.email,
			name: user.name,
			emailVerified: user.emailVerified,
			status: user.status,
			suspendedUntil: user.suspendedUntil,
			statusReason: user.statusReason,
		})
		.from(user)
		.where(eq(user.linkToken, token))
		.get();
	return row ?? null;
}

/** Somebody's own state, for the dashboard and the RSVP board. */
export async function findPersonState(
	db: Db,
	userId: string,
): Promise<PersonState | null> {
	const row = await db
		.select({
			id: user.id,
			email: user.email,
			name: user.name,
			status: user.status,
			suspendedUntil: user.suspendedUntil,
			statusReason: user.statusReason,
		})
		.from(user)
		.where(eq(user.id, userId))
		.get();
	return row ?? null;
}

/**
 * Somebody who could still be sent a sign-in link, by address. Suspended
 * counts: getting back in is exactly how they come back. Deactivated does not.
 */
export async function findReachablePersonByEmail(
	db: Db,
	email: string,
): Promise<{ id: string; linkSentAt: Date | null } | null> {
	const row = await db
		.select({ id: user.id, linkSentAt: user.linkSentAt })
		.from(user)
		.where(and(eq(user.email, normalizeEmail(email)), notDeactivated()))
		.get();
	return row ?? null;
}

/** The sign-in token for a person, generating one if the row predates them. */
export async function ensureLinkToken(db: Db, id: string): Promise<string> {
	const row = await db
		.select({ linkToken: user.linkToken })
		.from(user)
		.where(eq(user.id, id))
		.get();
	if (row?.linkToken) return row.linkToken;
	const token = newToken();
	await db.update(user).set({ linkToken: token }).where(eq(user.id, id));
	return token;
}

/** The token in this person's list-email footer, generating one if missing. */
export async function ensureUnsubscribeToken(
	db: Db,
	id: string,
): Promise<string> {
	const row = await db
		.select({ unsubscribeToken: user.unsubscribeToken })
		.from(user)
		.where(eq(user.id, id))
		.get();
	if (row?.unsubscribeToken) return row.unsubscribeToken;
	const token = newToken();
	await db.update(user).set({ unsubscribeToken: token }).where(eq(user.id, id));
	return token;
}

/** Record that a sign-in link just went out, for the request cooldown. */
export async function markLinkSent(db: Db, id: string): Promise<void> {
	await db.update(user).set({ linkSentAt: new Date() }).where(eq(user.id, id));
}

/**
 * Take somebody off the sheet for every game still ahead of them.
 *
 * Stepping away has to mean stepping off the headcount, or a cancelled
 * flight the night before still counts toward the next day's total, shows up in the In list of
 * every email, and gets none of them -- because none of those emails go to
 * anybody on a break.
 *
 * Dates are compared as YYYY-MM-DD strings against the venue's calendar day,
 * which is what `game.date` has always been.
 */
async function standDown(db: Db, userId: string): Promise<void> {
	const today = new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/New_York",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
	await db
		.update(rsvp)
		.set({ response: "out" })
		.where(
			and(
				eq(rsvp.userId, userId),
				ne(rsvp.response, "out"),
				inArray(
					rsvp.gameId,
					db.select({ id: game.id }).from(game).where(gte(game.date, today)),
				),
			),
		);
}

export type SuspendInput = {
	userId: string;
	reason?: string | null;
	/** Null means "until they say otherwise". */
	until?: Date | null;
	by: StatusActor;
};

/**
 * Step somebody away for a while. No game email, no spot on the sheet, but
 * their link still signs them in — that is how they come back. Never touches
 * a deactivated row: an admin put them there and only an admin lifts it.
 */
export async function suspend(db: Db, input: SuspendInput): Promise<boolean> {
	await standDown(db, input.userId);
	const result = await db
		.update(user)
		.set({
			status: "suspended",
			suspendedUntil: input.until ?? null,
			statusReason: input.reason?.trim() || null,
			statusChangedAt: new Date(),
			statusChangedBy: input.by,
		})
		.where(and(eq(user.id, input.userId), ne(user.status, "deactivated")))
		.run();
	return result.meta.changes === 1;
}

/**
 * Take an address off the list because the mail bounced, or because they hit
 * Unsubscribe in their mail app. Only touches somebody who is currently
 * active, so a repeat webhook cannot clobber a reason they wrote themselves.
 */
export async function suspendByEmail(
	db: Db,
	email: string,
	input: { reason: string },
): Promise<boolean> {
	const result = await db
		.update(user)
		.set({
			status: "suspended",
			suspendedUntil: null,
			statusReason: input.reason,
			statusChangedAt: new Date(),
			statusChangedBy: "mail",
		})
		.where(
			and(eq(user.email, normalizeEmail(email)), eq(user.status, "active")),
		)
		.run();
	return result.meta.changes === 1;
}

/** Who a list-email footer link belongs to. Null when the token means nothing. */
export async function findPersonByUnsubscribeToken(
	db: Db,
	token: string,
): Promise<{
	id: string;
	email: string;
	name: string;
	status: PersonStatus;
} | null> {
	const row = await db
		.select({
			id: user.id,
			email: user.email,
			name: user.name,
			status: user.status,
		})
		.from(user)
		.where(eq(user.unsubscribeToken, token))
		.get();
	return row ?? null;
}

/**
 * Back on the list. Lifts a suspension only — a deactivated row is left
 * alone, so no self-service path can ever turn into a way to lift a ban.
 */
export async function unsuspend(db: Db, userId: string): Promise<boolean> {
	const result = await db
		.update(user)
		.set({
			status: "active",
			suspendedUntil: null,
			statusReason: null,
			statusChangedAt: new Date(),
			statusChangedBy: null,
		})
		.where(and(eq(user.id, userId), eq(user.status, "suspended")))
		.run();
	return result.meta.changes === 1;
}

/**
 * Out of the group. Admin only. `banned` is set in the same statement so
 * Better Auth refuses the password door too; the caller kills their sessions.
 */
export async function deactivate(
	db: Db,
	input: { userId: string; reason?: string | null },
): Promise<void> {
	await standDown(db, input.userId);
	const reason = input.reason?.trim() || null;
	await db
		.update(user)
		.set({
			status: "deactivated",
			suspendedUntil: null,
			statusReason: reason,
			statusChangedAt: new Date(),
			statusChangedBy: "admin",
			banned: true,
			banReason: reason,
			banExpires: null,
		})
		.where(eq(user.id, input.userId));
}

/** Undo a deactivation. Admin only, and the only thing that clears `banned`. */
export async function reactivate(db: Db, userId: string): Promise<void> {
	await db
		.update(user)
		.set({
			status: "active",
			suspendedUntil: null,
			statusReason: null,
			statusChangedAt: new Date(),
			statusChangedBy: null,
			banned: false,
			banReason: null,
			banExpires: null,
		})
		.where(eq(user.id, userId));
}

/**
 * Tidy suspensions whose date has passed. Housekeeping only — `activeWhere`
 * already treats them as active — so a missed run costs nothing but a stale
 * "Suspended until <a date last month>" in the admin table.
 */
export async function sweepExpiredSuspensions(
	db: Db,
	now: Date = new Date(),
): Promise<number> {
	const result = await db
		.update(user)
		.set({
			status: "active",
			suspendedUntil: null,
			statusReason: null,
			statusChangedAt: null,
			statusChangedBy: null,
		})
		.where(
			and(
				eq(user.status, "suspended"),
				isNotNull(user.suspendedUntil),
				lte(user.suspendedUntil, now),
			),
		)
		.run();
	return result.meta.changes ?? 0;
}

/** Stamp the tokens onto a row that has none. Idempotent; used by the create hook. */
export async function stampTokens(db: Db, userId: string): Promise<void> {
	// One statement per token, each guarded by its own IS NULL. Filling both in
	// a single UPDATE guarded on `link_token` would hand somebody a new
	// unsubscribe token whenever only the sign-in one was missing, and break
	// the footer links already sitting in their inbox.
	await db
		.update(user)
		.set({ linkToken: newToken() })
		.where(and(eq(user.id, userId), isNull(user.linkToken)));
	await db
		.update(user)
		.set({ unsubscribeToken: newToken() })
		.where(and(eq(user.id, userId), isNull(user.unsubscribeToken)));
}

export type { PersonSource, PersonStatus, StatusActor };
