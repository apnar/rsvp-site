import { getTableColumns, type Table } from "drizzle-orm";

export function chunk<T>(items: readonly T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		out.push(items.slice(i, i + size));
	}
	return out;
}

/** Ids per `IN (...)` slice: D1 caps a statement at 100 bound parameters. */
export const IN_LIST = 90;

/**
 * Split rows for a multi-row INSERT. D1 caps a statement at 100 bound
 * parameters and drizzle binds every column of every row (literal defaults
 * included), so the room per row is the table's column count, not what
 * the caller happens to set.
 */
export function insertChunks<T>(table: Table, rows: readonly T[]): T[][] {
	const columns = Object.keys(getTableColumns(table)).length;
	return chunk(rows, Math.max(1, Math.floor(100 / columns)));
}

/** Id lists of any length, in slices that fit one `IN (...)`. */
export function inChunks<T>(items: readonly T[]): T[][] {
	return chunk(items, IN_LIST);
}

/** Run a read once per slice of ids and concatenate what comes back. */
export async function mapChunks<T, R>(
	items: readonly T[],
	run: (slice: T[]) => Promise<R[]>,
): Promise<R[]> {
	const out: R[] = [];
	for (const slice of inChunks(items)) out.push(...(await run(slice)));
	return out;
}
