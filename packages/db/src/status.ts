import { and, eq, isNull, ne } from "drizzle-orm";

import { normalizeEmail } from "./addresses";
import type { Db } from "./index";
import { type Role, type UnsubscribeReason, user } from "./schema/auth";

/**
 * No more email. The account still works and invitations still list them;
 * the hosts see that this person will not get the mail. A repeat (the
 * webhook firing twice, the footer clicked again) keeps the first reason.
 */
export async function unsubscribe(
	db: Db,
	where: { id: string } | { email: string },
	reason: UnsubscribeReason,
): Promise<boolean> {
	const match =
		"id" in where
			? eq(user.id, where.id)
			: eq(user.email, normalizeEmail(where.email));
	const result = await db
		.update(user)
		.set({ unsubscribedAt: new Date(), unsubscribeReason: reason })
		// Never a deactivated row, like resubscribe: a Brevo event or the footer
		// form must not rewrite what an admin's decision left behind.
		.where(
			and(match, isNull(user.unsubscribedAt), ne(user.status, "deactivated")),
		)
		.run();
	return result.meta.changes === 1;
}

/**
 * Email again. Never touches a deactivated row, so no self-service path can
 * become a way around an admin. The caller also lifts Brevo's blocklist, or
 * the person reads as subscribed and is quietly undeliverable.
 */
export async function resubscribe(db: Db, userId: string): Promise<boolean> {
	const result = await db
		.update(user)
		.set({ unsubscribedAt: null, unsubscribeReason: null })
		.where(and(eq(user.id, userId), ne(user.status, "deactivated")))
		.run();
	return result.meta.changes === 1;
}

/**
 * Change what somebody may do. Written here rather than through Better
 * Auth's admin plugin, which only knows `admin` and `user` and refuses
 * `host`. The session cookie caches the old role for up to five minutes;
 * anything that grants access re-reads D1.
 */
export async function setRole(db: Db, userId: string, role: Role) {
	await db.update(user).set({ role }).where(eq(user.id, userId));
}

/**
 * Out. Admin only. `banned` is set in the same statement so Better Auth
 * refuses the password door too; the caller kills their sessions.
 */
export async function deactivate(
	db: Db,
	input: { userId: string; reason?: string | null },
): Promise<void> {
	const reason = input.reason?.trim() || null;
	await db
		.update(user)
		.set({
			status: "deactivated",
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
			statusChangedAt: new Date(),
			statusChangedBy: "admin",
			banned: false,
			banReason: null,
			banExpires: null,
		})
		.where(eq(user.id, userId));
}
