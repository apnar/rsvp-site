/** Why an address stops getting mail; the values `user.unsubscribe_reason` holds. */
type DropReason = "self" | "bounce" | "spam" | "invalid";

/** Payload `event` values that mean "stop emailing this address", and why. */
const DROP_EVENTS = new Map<string, DropReason>([
	["unsubscribed", "self"],
	["hard_bounce", "bounce"],
	["spam", "spam"],
	["invalid_email", "invalid"],
]);

export type BrevoDrop = { email: string; event: string; reason: DropReason };

/**
 * Which addresses a Brevo webhook body asks us to stop mailing. Events
 * arrive one per request or as an array (`batched: true`); anything else
 * (delivered, opened, an event without an address) decides nothing.
 * `received` is how many events were there, for the answer's count.
 */
export function dropsFrom(payload: unknown): {
	received: number;
	drops: BrevoDrop[];
} {
	const events = (Array.isArray(payload) ? payload : [payload]).filter(
		(e): e is { event?: unknown; email?: unknown } =>
			typeof e === "object" && e !== null,
	);
	const drops: BrevoDrop[] = [];
	for (const e of events) {
		const reason =
			typeof e.event === "string" ? DROP_EVENTS.get(e.event) : undefined;
		if (typeof e.email !== "string" || !e.email || !reason) continue;
		drops.push({ email: e.email, event: e.event as string, reason });
	}
	return { received: events.length, drops };
}
