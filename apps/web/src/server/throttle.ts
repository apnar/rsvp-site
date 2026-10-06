/**
 * The path as the limiter should see it. Better Auth strips trailing
 * slashes before it looks at a path (its own `normalizePathname`), and a
 * proxy or a future option could make it forgiving about more, so this
 * folds case, repeated and trailing slashes and percent-escapes too: every
 * spelling of a door lands in the door's bucket, and being stricter than
 * Better Auth only ever throttles a request it would have refused.
 */
export function throttleKey(rawUrl: string): string {
	let path: string;
	try {
		path = new URL(rawUrl).pathname;
	} catch {
		return "/";
	}
	try {
		path = decodeURIComponent(path);
	} catch {
		// A malformed escape: keep it as typed; Better Auth 404s it anyway.
	}
	return (
		path
			.toLowerCase()
			.replace(/\/{2,}/g, "/")
			.replace(/\/+$/, "") || "/"
	);
}
