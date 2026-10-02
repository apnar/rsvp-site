/**
 * What a role lets somebody do. Pure -- type imports only -- so the web app
 * can hide buttons with the same rules the API enforces.
 */
import type { Role } from "./schema/auth";

export type { Role };

/** What `user.role` means. Anything unrecognised, including null, is `user`. */
export function roleOf(role: string | null | undefined): Role {
	return role === "admin" || role === "host" ? role : "user";
}

/** May manage people, roles and every event. */
export function isAdmin(who: { role?: string | null } | null | undefined) {
	return roleOf(who?.role) === "admin";
}

/** May make events and keep contact groups. Admins can do anything a host can. */
export function canHost(who: { role?: string | null } | null | undefined) {
	return roleOf(who?.role) !== "user";
}
