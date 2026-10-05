import { and, eq, inArray } from "drizzle-orm";

import { inChunks, insertChunks, mapChunks } from "./batch";
import type { Db } from "./index";
import { user } from "./schema/auth";
import { textLink } from "./schema/sms";

const ALPHABET =
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const CODE_LENGTH = 12;

/**
 * A fresh `/t/` code: 12 base62 characters, about 71 bits. It signs
 * somebody in, so it must not be guessable; rejection sampling keeps every
 * character equally likely (a plain `% 62` would favour the first eight).
 */
export function newCode(): string {
	let out = "";
	while (out.length < CODE_LENGTH) {
		for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
			if (byte < 248 && out.length < CODE_LENGTH) out += ALPHABET[byte % 62];
		}
	}
	return out;
}

export function isCode(raw: string): boolean {
	return /^[0-9A-Za-z]{12}$/.test(raw);
}

/**
 * The code for each of these people landing on `path`, made when missing.
 * One code per person and path, so every text about one event carries the
 * same link. A code minted under an old sign-in token is dead (redeeming
 * checks the token), so it is replaced rather than handed out again.
 */
export async function textLinksFor(
	db: Db,
	people: readonly { id: string; linkToken: string | null }[],
	path: string,
): Promise<Map<string, string>> {
	const current = new Map(
		people.flatMap((p) => (p.linkToken ? [[p.id, p.linkToken] as const] : [])),
	);
	const ids = [...current.keys()];
	if (ids.length === 0) return new Map();
	const read = () =>
		mapChunks(ids, (slice) =>
			db
				.select({
					code: textLink.code,
					userId: textLink.userId,
					linkToken: textLink.linkToken,
				})
				.from(textLink)
				.where(and(inArray(textLink.userId, slice), eq(textLink.path, path)))
				.all(),
		);
	const live = (rows: Awaited<ReturnType<typeof read>>) =>
		new Map(
			rows
				.filter((r) => current.get(r.userId) === r.linkToken)
				.map((r) => [r.userId, r.code]),
		);
	const before = await read();
	const stale = before.filter((r) => current.get(r.userId) !== r.linkToken);
	for (const slice of inChunks(stale.map((r) => r.code))) {
		await db.delete(textLink).where(inArray(textLink.code, slice));
	}
	const have = live(before);
	const missing = ids.filter((id) => !have.has(id));
	if (missing.length === 0) return have;
	const rows = missing.map((id) => ({
		code: newCode(),
		userId: id,
		path,
		linkToken: current.get(id) ?? "",
	}));
	for (const slice of insertChunks(textLink, rows)) {
		// Two sends racing for one person: the loser's row is dropped and the
		// re-read hands both the winner's code.
		await db.insert(textLink).values(slice).onConflictDoNothing();
	}
	return live(await read());
}

/**
 * What a `/t/` code opens: the person's current sign-in token and the
 * path, or null when the code is unknown or was minted under a token that
 * has since been replaced.
 */
export async function redeemTextLink(
	db: Db,
	code: string,
): Promise<{ linkToken: string; path: string } | null> {
	if (!isCode(code)) return null;
	const row = await db
		.select({ linkToken: user.linkToken, path: textLink.path })
		.from(textLink)
		.innerJoin(
			user,
			and(eq(user.id, textLink.userId), eq(user.linkToken, textLink.linkToken)),
		)
		.where(eq(textLink.code, code))
		.get();
	return row?.linkToken ? { linkToken: row.linkToken, path: row.path } : null;
}
