/**
 * Better Auth's own error type, re-exported so callers can tell "the
 * password was too short" from "the database fell over" without taking a
 * direct dependency on better-auth.
 */
export { APIError } from "better-auth/api";
