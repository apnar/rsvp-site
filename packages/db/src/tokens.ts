import { and, eq, isNull } from "drizzle-orm";

import type { Db } from "./index";
import { user } from "./schema/auth";

/** A fresh token: 32 hex characters, unguessable. */
export function newToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The two bearer tokens a person carries: the sign-in key and the footer's. */
type TokenColumn = "linkToken" | "unsubscribeToken";

const tokenOf = {
	linkToken: user.linkToken,
	unsubscribeToken: user.unsubscribeToken,
};

/**
 * Write a fresh token, only into a row that has none. Each token is stamped
 * by its own statement with its own IS NULL guard: filling both in one
 * UPDATE guarded on `link_token` would hand somebody a new unsubscribe token
 * whenever only the sign-in one was missing, and break the footer links
 * already sitting in their inbox.
 */
async function stampToken(db: Db, id: string, column: TokenColumn) {
	const token = newToken();
	await db
		.update(user)
		.set(
			column === "linkToken"
				? { linkToken: token }
				: { unsubscribeToken: token },
		)
		.where(and(eq(user.id, id), isNull(tokenOf[column])));
}

/**
 * A person's token, generating one if the row predates them. Guarded and
 * re-read: two callers racing must converge on one token, or one of them
 * mails a link that has already been replaced.
 */
async function ensureToken(
	db: Db,
	id: string,
	column: TokenColumn,
): Promise<string> {
	const read = () =>
		db
			.select({ token: tokenOf[column] })
			.from(user)
			.where(eq(user.id, id))
			.get();
	const row = await read();
	if (row?.token) return row.token;
	await stampToken(db, id, column);
	const after = await read();
	if (!after?.token) throw new Error("No such person");
	return after.token;
}

/** The sign-in token for a person, generating one if the row predates them. */
export function ensureLinkToken(db: Db, id: string): Promise<string> {
	return ensureToken(db, id, "linkToken");
}

/** The token in this person's list-email footer, generating one if missing. */
export function ensureUnsubscribeToken(db: Db, id: string): Promise<string> {
	return ensureToken(db, id, "unsubscribeToken");
}

/** Stamp the tokens onto a row that has none. Idempotent; used by the create hook. */
export async function stampTokens(db: Db, userId: string): Promise<void> {
	await stampToken(db, userId, "linkToken");
	await stampToken(db, userId, "unsubscribeToken");
}

/**
 * Replace the sign-in token. It sits in every list email, so a forwarded
 * message or a mail log is a way in until it changes; every link already
 * sent stops working. The caller revokes the person's sessions too, or the
 * old token would only be dead for the next sign-in.
 */
export async function rotateLinkToken(
	db: Db,
	userId: string,
): Promise<boolean> {
	const result = await db
		.update(user)
		.set({ linkToken: newToken() })
		.where(eq(user.id, userId))
		.run();
	return result.meta.changes === 1;
}

/** Who a sign-in link belongs to. Null when the token means nothing. */
export async function findPersonByLinkToken(db: Db, token: string) {
	const row = await db
		.select({
			id: user.id,
			email: user.email,
			name: user.name,
			emailVerified: user.emailVerified,
			noEmail: user.noEmail,
			status: user.status,
		})
		.from(user)
		.where(eq(user.linkToken, token))
		.get();
	return row ?? null;
}

/** Who a list-email footer link belongs to. Null when the token means nothing. */
export async function findPersonByUnsubscribeToken(db: Db, token: string) {
	const row = await db
		.select({
			id: user.id,
			email: user.email,
			name: user.name,
			status: user.status,
			unsubscribedAt: user.unsubscribedAt,
		})
		.from(user)
		.where(eq(user.unsubscribeToken, token))
		.get();
	return row ?? null;
}
