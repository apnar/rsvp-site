import { ORPCError } from "@orpc/server";
import type { Person } from "@rsvp-site/db/people";
import { event, eventDesign } from "@rsvp-site/db/schema/event";
import { basisOf } from "@rsvp-site/design/basis";
import {
	type Design,
	designPrefix,
	parseDesign,
	refsBelongTo,
	refsOf,
} from "@rsvp-site/design/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { Context } from "../context";
import { designValues, type EventRow, hostAccessTo } from "../events";
import { hostProcedure } from "../index";

type Env = Context["env"];

const idInput = z.object({ eventId: z.string().min(1) });

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const IMAGE_EXT: Record<(typeof IMAGE_TYPES)[number], string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};
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

const imageFile = z
	.file()
	.max(5 * 1024 * 1024, "Under 5 MB, please.")
	.mime([...IMAGE_TYPES], "A JPEG, PNG or WebP, please.");
const cardFile = z
	.file()
	.max(3 * 1024 * 1024, "The card image is too large.")
	.mime(["image/jpeg"], "The card image must be a JPEG.");
const basis = z.string().max(40);

async function editable(
	context: { db: Context["db"]; me: Pick<Person, "id" | "role"> },
	eventId: string,
) {
	const { event: row } = await hostAccessTo(context.db, context.me, eventId);
	if (row.status === "canceled") {
		throw new ORPCError("BAD_REQUEST", { message: "It's canceled." });
	}
	return row;
}

/** A paper event's guests answer by scanning; its card can't lack the code. */
export function needsQr(
	row: Pick<EventRow, "paper">,
	designOn: boolean,
	doc: { elements: readonly { type: string }[] },
) {
	if (row.paper && designOn && !doc.elements.some((el) => el.type === "qr")) {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"This is a paper invitation: add a QR code to the design so guests can scan it to answer.",
		});
	}
}

async function listPrefix(env: Env, prefix: string): Promise<R2Object[]> {
	const out: R2Object[] = [];
	let cursor: string | undefined;
	do {
		const page = await env.MEDIA.list({ prefix, cursor, limit: 1000 });
		out.push(...page.objects);
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
	return out;
}

function isCard(key: string, prefix: string): boolean {
	return key.slice(prefix.length).startsWith("card-");
}

async function putCard(env: Env, eventId: string, file: unknown, by: string) {
	const key = `${designPrefix(eventId)}card-${crypto.randomUUID()}.jpg`;
	// zod's `File` and the Workers `Blob` are different declarations of the
	// same object; see uploadCover.
	const bytes = await (file as Blob).arrayBuffer();
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

/** Every object under an event's design prefix, for deleting the event. */
export async function deleteDesignMedia(env: Env, eventId: string) {
	const keys = (await listPrefix(env, designPrefix(eventId))).map((o) => o.key);
	for (let i = 0; i < keys.length; i += 1000) {
		await env.MEDIA.delete(keys.slice(i, i + 1000));
	}
}

export const designsRouter = {
	/** The design document and the event's uploaded images, for the designer. */
	get: hostProcedure.input(idInput).handler(async ({ context, input }) => {
		const { event: row } = await hostAccessTo(
			context.db,
			context.me,
			input.eventId,
		);
		const prefix = designPrefix(row.id);
		const [saved, objects] = await Promise.all([
			context.db
				.select()
				.from(eventDesign)
				.where(eq(eventDesign.eventId, row.id))
				.get(),
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
		.handler(async ({ context, input }) => {
			const row = await editable(context, input.eventId);
			const prefix = designPrefix(row.id);
			const held = (await listPrefix(context.env, prefix)).filter(
				(o) => !isCard(o.key, prefix),
			);
			if (held.length >= MAX_IMAGES) {
				throw new ORPCError("BAD_REQUEST", {
					message: `An event holds up to ${MAX_IMAGES} images. Remove one you aren't using first.`,
				});
			}
			const type = input.file.type as (typeof IMAGE_TYPES)[number];
			const key = `${prefix}${crypto.randomUUID()}.${IMAGE_EXT[type]}`;
			const bytes = await (input.file as unknown as Blob).arrayBuffer();
			await context.env.MEDIA.put(key, bytes, {
				httpMetadata: { contentType: type },
				customMetadata: { eventId: row.id, uploadedBy: context.me.id },
			});
			return { ref: key };
		}),

	/** Remove an image from the tray, unless the saved design still uses it. */
	removeImage: hostProcedure
		.input(idInput.extend({ ref: z.string().max(200) }))
		.handler(async ({ context, input }) => {
			const row = await editable(context, input.eventId);
			const prefix = designPrefix(row.id);
			if (!input.ref.startsWith(prefix) || isCard(input.ref, prefix)) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Not one of this event's images.",
				});
			}
			const saved = await context.db
				.select({ doc: eventDesign.doc })
				.from(eventDesign)
				.where(eq(eventDesign.eventId, row.id))
				.get();
			const parsed = saved ? parseDesign(saved.doc) : null;
			if (parsed?.ok && refsOf(parsed.design).includes(input.ref)) {
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
		.handler(async ({ context, input }) => {
			const row = await editable(context, input.eventId);
			if (!row.coverKey) return { ref: null };
			const cover = await context.env.MEDIA.get(row.coverKey);
			if (!cover) return { ref: null };
			const ext = row.coverKey.split(".").pop() ?? "jpg";
			const key = `${designPrefix(row.id)}${crypto.randomUUID()}.${ext}`;
			await context.env.MEDIA.put(key, await cover.arrayBuffer(), {
				httpMetadata: cover.httpMetadata,
				customMetadata: { eventId: row.id, uploadedBy: context.me.id },
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
		.handler(async ({ context, input }) => {
			const row = await editable(context, input.eventId);
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
				throw new ORPCError("CONFLICT", {
					message:
						"Someone else saved this design while you were editing. Reload to see theirs.",
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
		.handler(async ({ context, input }) => {
			const { event: row } = await hostAccessTo(
				context.db,
				context.me,
				input.eventId,
			);
			const saved = await context.db
				.select({ doc: eventDesign.doc, version: eventDesign.version })
				.from(eventDesign)
				.where(eq(eventDesign.eventId, row.id))
				.get();
			if (!saved) return null;
			const values = designValues(row, "");
			const basis = basisOf(saved.version, values);
			return {
				// Parsed on the way in (save).
				doc: saved.doc as Design,
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
		.handler(async ({ context, input }) => {
			const row = await editable(context, input.eventId);
			const key = await putCard(context.env, row.id, input.card, context.me.id);
			await context.db
				.update(event)
				.set({ cardKey: key, cardBasis: input.basis })
				.where(eq(event.id, row.id));
			return { cardKey: key };
		}),

	/** Switch the design on or off without touching the document. */
	setOn: hostProcedure
		.input(idInput.extend({ on: z.boolean() }))
		.handler(async ({ context, input }) => {
			const row = await editable(context, input.eventId);
			if (input.on) {
				const saved = await context.db
					.select({ doc: eventDesign.doc })
					.from(eventDesign)
					.where(eq(eventDesign.eventId, row.id))
					.get();
				const parsed = saved ? parseDesign(saved.doc) : null;
				if (!parsed?.ok) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Design the card first.",
					});
				}
				needsQr(row, true, parsed.design);
			}
			await context.db
				.update(event)
				.set({ designOn: input.on })
				.where(eq(event.id, row.id));
			return { ok: true };
		}),
};
