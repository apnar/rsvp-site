/**
 * What the routers share about the MEDIA bucket: the image types it will
 * hold, how uploads are read and stored, and listing and emptying a prefix.
 */

import { designPrefix } from "@rsvp-site/design/schema";
import { z } from "zod";

import type { Context } from "./context";
import { type ImageType, sniffImage } from "./image-type";

/** The Worker's bindings, as a procedure's context carries them. */
export type Env = Context["env"];

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const IMAGE_EXT: Record<ImageType, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};

/** A cover photo or design image. The declared type is checked again on the bytes. */
export const imageFile = z
	.file()
	.max(5 * 1024 * 1024, "Under 5 MB, please.")
	.mime([...IMAGE_TYPES], "A JPEG, PNG or WebP, please.");

/** The small JPEG a picture text carries; carriers want it under ~600 KB. */
export const mmsImage = z
	.file()
	.max(600 * 1024, "The text-message picture is too large.")
	.mime(["image/jpeg"], "The text-message picture must be a JPEG.");

/**
 * A profile picture. The browser crops and renders it to a 512px JPEG
 * itself, so anything bigger or of another type did not come from our page.
 */
export const avatarFile = z
	.file()
	.max(1024 * 1024, "Under 1 MB, please.")
	.mime(["image/jpeg"], "A JPEG, please.");

/**
 * An upload's bytes. zod's `File` and the Workers `Blob` are different
 * declarations of the same object; the cast bridges that mismatch, it is
 * not a conversion.
 */
export function fileBytes(
	file:
		| z.output<typeof imageFile>
		| z.output<typeof avatarFile>
		| z.output<typeof mmsImage>,
): Promise<ArrayBuffer> {
	return (file as unknown as Blob).arrayBuffer();
}

/**
 * Store an image under `prefix` with its extension, and return the key.
 * `name` leads the random part, so card pictures can be told from uploads
 * by their key alone.
 */
export async function putImage(
	env: Env,
	prefix: string,
	type: ImageType,
	bytes: ArrayBuffer,
	meta: Record<string, string>,
	name = "",
) {
	const key = `${prefix}${name}${crypto.randomUUID()}.${IMAGE_EXT[type]}`;
	await env.MEDIA.put(key, bytes, {
		httpMetadata: { contentType: type },
		customMetadata: meta,
	});
	return key;
}

/**
 * The small picture-text twin of a card or cover is `<name>-mms.jpg`, so
 * it is one of that picture's own keys to every rule that prunes by prefix
 * but not one more picture to count: it follows its original.
 */
const MMS_SUFFIX = "-mms.jpg";
export function isMms(key: string): boolean {
	return key.endsWith(MMS_SUFFIX);
}
export function mmsTwin(key: string): string {
	return key.replace(/\.[a-z]+$/, MMS_SUFFIX);
}

/**
 * Store the rendition next to `key` and return its key. A courtesy: one
 * that isn't a JPEG is dropped (null) rather than refused, and the sender
 * falls back to the picture itself when that is small enough.
 */
export async function putMmsTwin(
	env: Env,
	key: string,
	file: z.output<typeof mmsImage> | undefined,
	meta: Record<string, string>,
): Promise<string | null> {
	if (!file) return null;
	const small = await fileBytes(file);
	if (sniffImage(small) !== "image/jpeg") return null;
	const twin = mmsTwin(key);
	await env.MEDIA.put(twin, small, {
		httpMetadata: { contentType: "image/jpeg" },
		customMetadata: meta,
	});
	return twin;
}

export async function listPrefix(
	env: Env,
	prefix: string,
): Promise<R2Object[]> {
	const out: R2Object[] = [];
	let cursor: string | undefined;
	do {
		const page = await env.MEDIA.list({ prefix, cursor, limit: 1000 });
		out.push(...page.objects);
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
	return out;
}

/** Every object under an event's design prefix, for deleting the event. */
export async function deleteDesignMedia(env: Env, eventId: string) {
	const keys = (await listPrefix(env, designPrefix(eventId))).map((o) => o.key);
	for (let i = 0; i < keys.length; i += 1000) {
		await env.MEDIA.delete(keys.slice(i, i + 1000));
	}
}
