/**
 * Profile pictures: `user.image` holds the R2 key. Shared by the account
 * router (yourself) and the people router (admins), since routers never
 * import each other. Every picture gets a new key, so the served copy can be
 * cached for good; the old object goes only once the new key is saved.
 */

import { ORPCError } from "@orpc/server";
import type { Db } from "@rsvp-site/db";
import { user } from "@rsvp-site/db/schema/auth";
import { eq } from "drizzle-orm";
import type { z } from "zod";

import { sniffImage } from "./image-type";
import { type avatarFile, type Env, fileBytes, putImage } from "./media";

async function currentKey(db: Db, userId: string) {
	const row = await db
		.select({ image: user.image })
		.from(user)
		.where(eq(user.id, userId))
		.get();
	return row?.image ?? null;
}

export async function setPicture(
	db: Db,
	env: Env,
	userId: string,
	file: z.output<typeof avatarFile>,
	uploadedBy: string,
) {
	const bytes = await fileBytes(file);
	// The declared type is the client's word; the bytes decide.
	if (sniffImage(bytes) !== "image/jpeg") {
		throw new ORPCError("BAD_REQUEST", { message: "A JPEG, please." });
	}
	const key = await putImage(env, "avatars/", "image/jpeg", bytes, {
		userId,
		uploadedBy,
	});
	const old = await currentKey(db, userId);
	await db.update(user).set({ image: key }).where(eq(user.id, userId));
	if (old) await env.MEDIA.delete(old);
	return { image: key };
}

export async function removePicture(db: Db, env: Env, userId: string) {
	const old = await currentKey(db, userId);
	await db.update(user).set({ image: null }).where(eq(user.id, userId));
	if (old) await env.MEDIA.delete(old);
	return { image: null };
}
