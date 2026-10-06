/**
 * Whether the site is running on a developer's machine. The only thing that
 * may let a missing API key mean "print the message instead of sending it":
 * the printed sign-in links are working credentials.
 */
export function isLocal(origin: string): boolean {
	try {
		const { hostname } = new URL(origin);
		return hostname === "localhost" || hostname === "127.0.0.1";
	} catch {
		return false;
	}
}
