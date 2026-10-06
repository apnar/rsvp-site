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

/**
 * An error as one loggable string, its causes included, with every failed
 * query's bound parameters left out. Drizzle puts them in the message
 * ("Failed query: ...\nparams: ...") and so in the stack, and here they
 * are addresses, phone numbers and the tokens that sign people in, which
 * Workers logs would keep. So only the stack's frames are kept, never its
 * first line.
 */
export function describeError(error: unknown): string {
	const parts: string[] = [];
	let frames: string[] = [];
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current; depth++) {
		if (current instanceof Error) {
			const message =
				"params" in current
					? (current.message.split("\nparams:")[0] ?? "")
					: current.message;
			parts.push(`${current.name}: ${message}`);
			if (frames.length === 0) {
				frames = (current.stack ?? "")
					.split("\n")
					.filter((line) => /^\s+at /.test(line))
					.slice(0, 8);
			}
			current = current.cause;
		} else {
			parts.push(String(current));
			current = undefined;
		}
	}
	return [parts.join(" <- "), ...frames].join("\n");
}

/** `console.error` for anything that may have come out of a query. */
export function logError(label: string, error: unknown): void {
	console.error(`${label}: ${describeError(error)}`);
}
