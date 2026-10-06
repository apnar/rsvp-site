import { ORPCError } from "@orpc/server";

/**
 * Behind Cloudflare the caller is `cf-connecting-ip`; "local" is the dev
 * server, where there is no such header and one shared bucket is fine.
 */
export function callerIp(headers: { get(name: string): string | null }) {
	return headers.get("cf-connecting-ip") ?? "local";
}

/** The Workers rate-limit binding's one method, so tests need no Worker. */
type Limiter = {
	limit(options: { key: string }): Promise<{ success: boolean }>;
};

/** Refuse with 429 once `key` has used up its limiter's allowance. */
export async function requireUnderLimit(
	limiter: Limiter,
	key: string,
	message = "Slow down a little, then try again.",
): Promise<void> {
	const { success } = await limiter.limit({ key });
	if (!success) throw new ORPCError("TOO_MANY_REQUESTS", { message });
}
