import { ORPCError } from "@orpc/server";
import { built, rawBatch } from "@rsvp-site/db/batch";
import { event, eventDesign } from "@rsvp-site/db/schema/event";
import { basisOf } from "@rsvp-site/design/basis";
import {
	designPrefix,
	parseDesign,
	refsBelongTo,
	refsOf,
} from "@rsvp-site/design/schema";
import { and, eq, exists, not, type SQL, sql } from "drizzle-orm";
import { z } from "zod";

import { needsQr } from "../design-rules";
import { savedDesign } from "../designs-store";
import { designValues, NOBODY } from "../events";
import { withHostEvent, withLiveHostEvent } from "../host-event";
import { sniffImage } from "../image-type";
import { hostProcedure } from "../index";
import { idInput } from "../inputs";
import { type Env, fileBytes, imageFile, listPrefix, putImage } from "../media";

/** Uploads an event may hold at once, card images aside. */
const MAX_IMAGES = 20;
/**
 * An unused upload younger than this survives a save: a co-host may have
 * just added it to a design they haven't saved yet.
 */
const ORPHAN_GRACE_MS = 60 * 60 * 1000;
/**
 * Old card images are kept, because emails already sent show them, but not
 * without end.
 */
const MAX_CARDS = 30;
/**
 * Card pictures an event may hold. Sent emails keep showing the old ones, so
 * uploadCard can't just overwrite; but a host (or a stolen session) calling
 * it in a loop would otherwise fill R2 without limit. Past the cap the
 * cards older than CARD_KEEP_MS go first, and if that is not enough the
 * upload is refused: nobody sent an email last month with 200 cards in it.
 */
const MAX_CARD_FILES = 200;
const CARD_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

const cardFile = z
	.file()
	.max(3 * 1024 * 1024, "The card image is too large.")
	.mime(["image/jpeg"], "The card image must be a JPEG.");
const basis = z.string().max(40);

function isCard(key: string, prefix: string): boolean {
	return key.slice(prefix.length).startsWith("card-");
}

/**
 * Delete uploads no design uses (once they are old enough that nobody is
 * mid-edit with them) and card images beyond the newest few.
 */
async function prune(env: Env, eventId: string, keep: Set<string>) {
	const prefix = designPrefix(eventId);
	const objects = await listPrefix(env, prefix);
	const cutoff = Date.now() - ORPHAN_GRACE_MS;
	const drop = objects
		.filter((o) => !isCard(o.key, prefix))
		.filter((o) => !keep.has(o.key) && o.uploaded.getTime() < cutoff)
		.map((o) => o.key);
	const cards = objects
		.filter((o) => isCard(o.key, prefix) && !keep.has(o.key))
		.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime());
	drop.push(...cards.slice(MAX_CARDS - 1).map((o) => o.key));
	if (drop.length > 0) await env.MEDIA.delete(drop);
}

async function makeRoomForCard(
	env: Env,
	eventId: string,
	current: string | null,
) {
	const prefix = designPrefix(eventId);
	const cards = (await listPrefix(env, prefix)).filter((o) =>
		isCard(o.key, prefix),
	);
	if (cards.length < MAX_CARD_FILES) return;
	const cutoff = Date.now() - CARD_KEEP_MS;
	// Never the card the event points at, however old: it is the live one.
	const old = cards
		.filter((o) => o.key !== current && o.uploaded.getTime() < cutoff)
		.sort((a, b) => a.uploaded.getTime() - b.uploaded.getTime())
		.slice(0, cards.length - MAX_CARD_FILES + 1)
		.map((o) => o.key);
	if (cards.length - old.length >= MAX_CARD_FILES) {
		throw new ORPCError("BAD_REQUEST", {
			message: "This event has as many card pictures as it can keep.",
		});
	}
	if (old.length > 0) await env.MEDIA.delete(old);
}

/**
 * The key of an object already holding exactly these bytes, if any. R2's
 * etag for a single upload is the MD5 of its content, so this costs one
 * digest and no reads.
 */
async function alreadyHeld(
	held: readonly R2Object[],
	bytes: ArrayBuffer,
): Promise<string | null> {
	const digest = await crypto.subtle.digest("MD5", bytes);
	const md5 = [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return held.find((o) => o.etag === md5)?.key ?? null;
}

/**
 * Add an image to an event's design images: the same picture again is the
 * one already held (a template picked twice, a photo added twice), not
 * another copy toward the limit. Null when the bytes are not an image the
 * site takes -- the declared type is the client's word, the bytes decide.
 */
async function storeDesignImage(
	env: Env,
	eventId: string,
	uploadedBy: string,
	bytes: ArrayBuffer,
): Promise<string | null> {
	const prefix = designPrefix(eventId);
	const held = (await listPrefix(env, prefix)).filter(
		(o) => !isCard(o.key, prefix),
	);
	const type = sniffImage(bytes);
	if (!type) return null;
	const same = await alreadyHeld(held, bytes);
	if (same) return same;
	if (held.length >= MAX_IMAGES) {
		throw new ORPCError("BAD_REQUEST", {
			message: `An event holds up to ${MAX_IMAGES} images. Remove one you aren't using first.`,
		});
	}
	return putImage(env, prefix, type, bytes, { eventId, uploadedBy });
}

export const designsRouter = {
	/** The design document and the event's uploaded images, for the designer. */
	get: hostProcedure
		.input(idInput)
		.use(withHostEvent)
		.handler(async ({ context }) => {
			const row = context.event;
			const prefix = designPrefix(row.id);
			const [saved, objects] = await Promise.all([
				savedDesign(context.db, row.id),
				listPrefix(context.env, prefix),
			]);
			return {
				doc: saved?.doc ?? null,
				version: saved?.version ?? 0,
				designOn: row.designOn,
				cardKey: row.cardKey,
				cardBasis: row.cardBasis,
				images: objects
					.filter((o) => !isCard(o.key, prefix))
					.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime())
					.map((o) => o.key),
			};
		}),

	/**
	 * Add an image to the event's design images. The browser shrinks it and
	 * reports its size first; the limits here are the backstop.
	 */
	uploadImage: hostProcedure
		.input(idInput.extend({ file: imageFile }))
		.use(withLiveHostEvent)
		.handler(async ({ context, input }) => {
			const row = context.event;
			const ref = await storeDesignImage(
				context.env,
				row.id,
				context.me.id,
				await fileBytes(input.file),
			);
			if (!ref) {
				throw new ORPCError("BAD_REQUEST", {
					message: "A JPEG, PNG or WebP, please.",
				});
			}
			return { ref };
		}),

	/** Remove an image from the tray, unless the saved design still uses it. */
	removeImage: hostProcedure
		.input(idInput.extend({ ref: z.string().max(200) }))
		.use(withLiveHostEvent)
		.handler(async ({ context, input }) => {
			const row = context.event;
			const prefix = designPrefix(row.id);
			if (!input.ref.startsWith(prefix) || isCard(input.ref, prefix)) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Not one of this event's images.",
				});
			}
			const saved = await savedDesign(context.db, row.id);
			if (saved?.doc && refsOf(saved.doc).includes(input.ref)) {
				throw new ORPCError("BAD_REQUEST", {
					message: "The saved design still uses that image.",
				});
			}
			await context.env.MEDIA.delete(input.ref);
			return { ok: true };
		}),

	/**
	 * The event's cover photo, copied in as a design image, so templates can
	 * use it and replacing the cover later can't pull it out of the design.
	 */
	copyCover: hostProcedure
		.input(idInput)
		.use(withLiveHostEvent)
		.handler(async ({ context }) => {
			const row = context.event;
			if (!row.coverKey) return { ref: null };
			const cover = await context.env.MEDIA.get(row.coverKey);
			if (!cover) return { ref: null };
			const ref = await storeDesignImage(
				context.env,
				row.id,
				context.me.id,
				await cover.arrayBuffer(),
			);
			return { ref };
		}),

	/**
	 * Save the design. `version` is the one the editor started from: if a
	 * co-host saved in between, this one is refused rather than writing
	 * over theirs. The card image follows (cardInputs, then uploadCard),
	 * drawn by the browser from what was saved.
	 */
	save: hostProcedure
		.input(
			idInput.extend({
				doc: z.unknown(),
				version: z.number().int().min(0),
				designOn: z.boolean(),
			}),
		)
		.use(withLiveHostEvent)
		.handler(async ({ context, input }) => {
			const row = context.event;
			const parsed = parseDesign(input.doc);
			if (!parsed.ok) {
				throw new ORPCError("BAD_REQUEST", { message: parsed.message });
			}
			const design = parsed.design;
			if (!refsBelongTo(design, row.id)) {
				throw new ORPCError("BAD_REQUEST", {
					message: "That image isn't one of this event's.",
				});
			}
			const refs = refsOf(design);
			const found = await Promise.all(
				refs.map((r) => context.env.MEDIA.head(r)),
			);
			if (found.some((o) => o === null)) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"An image in the design has been removed. Put it back or take it out.",
				});
			}
			needsQr(row, input.designOn, design);

			const version = input.version + 1;
			// One atomic batch: the document and the event's on/off and theme
			// land together or not at all, so a failure between them can't leave
			// a page whose colours are the old design's. Both statements are
			// guarded on the version this save started from -- the state before
			// either runs -- so a stale save changes neither, and a co-host's
			// newer version is never mistaken for ours.
			const heldDesign = (...also: SQL[]) =>
				exists(
					context.db
						.select({ one: sql`1` })
						.from(eventDesign)
						.where(and(eq(eventDesign.eventId, row.id), ...also)),
				);
			const unchanged =
				input.version === 0
					? not(heldDesign())
					: heldDesign(eq(eventDesign.version, input.version));
			const [, claimed] = await rawBatch(context.db.$client, [
				built(
					context.db
						.update(event)
						.set({ designOn: input.designOn, theme: design.theme })
						.where(and(eq(event.id, row.id), unchanged)),
				),
				built(
					input.version === 0
						? context.db
								.insert(eventDesign)
								.values({
									eventId: row.id,
									doc: design,
									version,
									updatedBy: context.me.id,
								})
								.onConflictDoNothing()
						: context.db
								.update(eventDesign)
								.set({ doc: design, version, updatedBy: context.me.id })
								.where(
									and(
										eq(eventDesign.eventId, row.id),
										eq(eventDesign.version, input.version),
									),
								),
				),
			]);
			if (claimed?.meta.changes !== 1) {
				// Say who: a host's own second tab is the usual culprit, and
				// "someone else" sends them looking for a co-host who isn't there.
				const now = await context.db
					.select({ updatedBy: eventDesign.updatedBy })
					.from(eventDesign)
					.where(eq(eventDesign.eventId, row.id))
					.get();
				throw new ORPCError("CONFLICT", {
					message:
						now?.updatedBy === context.me.id
							? "You saved this design from another tab or window since this one opened. Reload to carry on from there."
							: "A co-host saved this design while you were editing. Reload to see theirs.",
				});
			}

			await prune(
				context.env,
				row.id,
				new Set([...refs, ...(row.cardKey ? [row.cardKey] : [])]),
			);
			return { version };
		}),

	/**
	 * What the browser needs to draw the card image, and whether the one
	 * stored was drawn from something else: an older version, or facts
	 * that have changed since.
	 */
	cardInputs: hostProcedure
		.input(idInput)
		.use(withHostEvent)
		.handler(async ({ context }) => {
			const row = context.event;
			const saved = await savedDesign(context.db, row.id);
			if (!saved?.doc) return null;
			const values = designValues(row, NOBODY);
			const basis = basisOf(saved.version, values);
			return {
				doc: saved.doc,
				values,
				basis,
				stale: row.cardBasis !== basis,
			};
		}),

	/**
	 * A card image, drawn by the browser from cardInputs after a save, or
	 * after the event's facts changed under it (the date moved, the title
	 * was reworded). `basis` is what it was drawn from.
	 */
	uploadCard: hostProcedure
		.input(idInput.extend({ card: cardFile, basis }))
		.use(withLiveHostEvent)
		.handler(async ({ context, input }) => {
			const row = context.event;
			const bytes = await fileBytes(input.card);
			if (sniffImage(bytes) !== "image/jpeg") {
				throw new ORPCError("BAD_REQUEST", {
					message: "The card image must be a JPEG.",
				});
			}
			await makeRoomForCard(context.env, row.id, row.cardKey);
			const key = await putImage(
				context.env,
				designPrefix(row.id),
				"image/jpeg",
				bytes,
				{ eventId: row.id, uploadedBy: context.me.id },
				"card-",
			);
			await context.db
				.update(event)
				.set({ cardKey: key, cardBasis: input.basis })
				.where(eq(event.id, row.id));
			return { cardKey: key };
		}),

	/** Switch the design on or off without touching the document. */
	setOn: hostProcedure
		.input(idInput.extend({ on: z.boolean() }))
		.use(withLiveHostEvent)
		.handler(async ({ context, input }) => {
			const row = context.event;
			if (input.on) {
				const saved = await savedDesign(context.db, row.id);
				if (!saved?.doc) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Design the card first.",
					});
				}
				needsQr(row, true, saved.doc);
			}
			await context.db
				.update(event)
				.set({ designOn: input.on })
				.where(eq(event.id, row.id));
			return { ok: true };
		}),
};
