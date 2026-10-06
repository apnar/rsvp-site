import { and, eq, isNotNull, isNull, ne, or, sql } from "drizzle-orm";

import { textablePhone } from "./phone";
import { user } from "./schema/auth";

/** Not thrown out. `banned` is nullable, so never compare it with `= 0`. */
export function notDeactivated() {
	return and(
		ne(user.status, "deactivated"),
		or(isNull(user.banned), eq(user.banned, false)),
	);
}

/**
 * The status half of `notDeactivated`, for a write's WHERE: `banned` is
 * written in the same statement as `status`, so the status alone is the
 * guard, and a self-service UPDATE can never touch an admin's decision.
 */
export function stillIn() {
	return ne(user.status, "deactivated");
}

/**
 * Somebody email may go to: not deactivated, not unsubscribed, and with a
 * real address -- a name-only paper guest's placeholder is never mailed.
 */
export function mailableWhere() {
	return and(
		notDeactivated(),
		isNull(user.unsubscribedAt),
		eq(user.noEmail, false),
	);
}

/**
 * Somebody a text may go to: not deactivated, a US mobile-shaped number,
 * the consent on record, texts not switched off, and the number not
 * blocked. The block is matched by hand-qualified names on purpose: drizzle
 * leaves a single-table query's columns unqualified, and inside the
 * subquery `"phone"` would mean sms_block's own.
 */
export function textableWhere() {
	return and(
		notDeactivated(),
		// The shape, loosely: D1 refuses a GLOB spelling out every digit as
		// "too complex", and `listTextable` checks the number exactly.
		sql`"user"."phone" like '+1%' and length("user"."phone") = 12`,
		isNotNull(user.textsOkAt),
		isNull(user.textsOffAt),
		sql`not exists (select 1 from "sms_block" "b" where "b"."phone" = "user"."phone")`,
	);
}

/** The columns the JS twins below read, as a joined query selects them. */
type ReachRow = {
	status: string;
	banned?: boolean | null;
	unsubscribedAt: Date | null;
	noEmail: boolean;
	phone: string | null;
	textsOkAt: Date | null;
	textsOffAt: Date | null;
	/** Why the number is in `sms_block`, or null when it is not. */
	textBlock: string | null;
};

function active(row: Pick<ReachRow, "status" | "banned">): boolean {
	return row.status !== "deactivated" && !row.banned;
}

/** `mailableWhere`, for rows already read. */
export function isMailable(
	row: Pick<ReachRow, "status" | "banned" | "unsubscribedAt" | "noEmail">,
): boolean {
	return active(row) && row.unsubscribedAt === null && !row.noEmail;
}

/**
 * `textableWhere`, for rows already read. The SQL only checks the number's
 * shape loosely; this checks it exactly, as `listTextable` does.
 */
export function isTextable(
	row: Pick<
		ReachRow,
		"status" | "banned" | "phone" | "textsOkAt" | "textsOffAt" | "textBlock"
	>,
): boolean {
	return (
		active(row) &&
		textablePhone(row.phone) !== null &&
		row.textsOkAt !== null &&
		row.textsOffAt === null &&
		row.textBlock === null
	);
}

/**
 * Whether a host's "they expect a text from me" could switch consent on:
 * a number that could be texted, a blank where consent goes, and a record
 * nobody has claimed. Everything `isTextable` needs except the consent.
 */
export function canVouchTexts(
	row: Pick<
		ReachRow,
		"status" | "banned" | "phone" | "textsOkAt" | "textsOffAt" | "textBlock"
	> & { claimedAt: Date | null },
): boolean {
	return (
		active(row) &&
		textablePhone(row.phone) !== null &&
		row.textsOkAt === null &&
		row.textsOffAt === null &&
		row.claimedAt === null &&
		row.textBlock === null
	);
}

/** A name-only guest's placeholder address is never shown, even to a host. */
export function shownEmail(row: { email: string; noEmail: boolean }): string {
	return row.noEmail ? "" : row.email;
}
