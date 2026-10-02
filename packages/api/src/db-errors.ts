/** D1 wraps SQLite errors twice; the UNIQUE text lives in a nested cause. */
export function isUniqueViolation(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current; depth++) {
		const message =
			current instanceof Error ? current.message : String(current);
		if (message.includes("UNIQUE constraint failed")) return true;
		current = current instanceof Error ? current.cause : undefined;
	}
	return false;
}
