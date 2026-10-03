import { ORPCError } from "@orpc/server";
import { event, eventDesign } from "@rsvp-site/db/schema/event";
import { basisOf } from "@rsvp-site/design/basis";
import {
	designPrefix,
	parseDesign,
	refsBelongTo,
	refsOf,
} from "@rsvp-site/design/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { Context } from "../context";
import { needsQr } from "../design-rules";
import { savedDesign } from "../designs-store";
import { designValues } from "../events";
import { withHostEvent, withLiveHostEvent } from "../host-event";
import { sniffImage } from "../image-type";
import { hostProcedure } from "../index";
import { idInput } from "../inputs";
import { fileBytes, imageFile, listPrefix, putImage } from "../media";

type Env = Context["env"];

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

const cardFile = z
	.file()
	.max(3 * 1024 * 1024, "The card image is too large.")
	.mime(["image/jpeg"], "The card image must be a JPEG.");
const basis = z.string().max(40);

function isCard(key: string, prefix: string): boolean {
	return key.slice(prefix.length).startsWith("card-");
}

async function putCard(
	env: Env,
	eventId: string,
	bytes: ArrayBuffer,
	by: string,
) {
	const key = `${designPrefix(eventId)}card-${crypto.randomUUID()}.jpg`;
	await env.MEDIA.put(key, bytes, {
		httpMetadata: { contentType: "image/jpeg" },
		customMetadata: { eventId, uploadedBy: by },
	});
	return key;
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
			const prefix = designPrefix(row.id);
			const held = (await listPrefix(context.env, prefix)).filter(
				(o) => !isCard(o.key, prefix),
			);
			const bytes = await fileBytes(input.file);
			// The declared type is the client's word; the bytes decide.
			const type = sniffImage(bytes);
			if (!type) {
				throw new ORPCError("BAD_REQUEST", {
					message: "A JPEG, PNG or WebP, please.",
				});
			}
			// The same picture again (a template picked twice, a photo added
			// twice) is the one already here, not another copy toward the limit.
			const same = await alreadyHeld(held, bytes);
			if (same) return { ref: same };
			if (held.length >= MAX_IMAGES) {
				throw new ORPCError("BAD_REQUEST", {
					message: `An event holds up to ${MAX_IMAGES} images. Remove one you aren't using first.`,
				});
			}
			const key = await putImage(context.env, prefix, type, bytes, {
				eventId: row.id,
				uploadedBy: context.me.id,
			});
			return { ref: key };
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
			const prefix = designPrefix(row.id);
			const bytes = await cover.arrayBuffer();
			const held = (await listPrefix(context.env, prefix)).filter(
				(o) => !isCard(o.key, prefix),
			);
			const type = sniffImage(bytes);
			if (!type) return { ref: null };
			const same = await alreadyHeld(held, bytes);
			if (same) return { ref: same };
			const key = await putImage(context.env, prefix, type, bytes, {
				eventId: row.id,
				uploadedBy: context.me.id,
			});
			return { ref: key };
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
			const claimed =
				input.version === 0
					? await context.db
							.insert(eventDesign)
							.values({
								eventId: row.id,
								doc: design,
								version,
								updatedBy: context.me.id,
							})
							.onConflictDoNothing()
							.run()
					: await context.db
							.update(eventDesign)
							.set({ doc: design, version, updatedBy: context.me.id })
							.where(
								and(
									eq(eventDesign.eventId, row.id),
									eq(eventDesign.version, input.version),
								),
							)
							.run();
			if (claimed.meta.changes !== 1) {
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

			await context.db
				.update(event)
				.set({ designOn: input.designOn, theme: design.theme })
				.where(eq(event.id, row.id));
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
			const values = designValues(row, "");
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
			const key = await putCard(context.env, row.id, bytes, context.me.id);
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
