import { ORPCError } from "@orpc/server";
import { event } from "@rsvp-site/db/schema/event";
import { eq } from "drizzle-orm";

import { withLiveHostEvent } from "../../host-event";
import { sniffImage } from "../../image-type";
import { hostProcedure } from "../../index";
import { idInput } from "../../inputs";
import { fileBytes, imageFile, mmsImage, putImage } from "../../media";

export const coverRouter = {
	/**
	 * Put up a cover photo. The browser scales it down before upload, so the
	 * limit here is a backstop, not the usual case. The old photo is deleted
	 * after the new one is in place, never before.
	 */
	uploadCover: hostProcedure
		.input(idInput.extend({ file: imageFile, mms: mmsImage.optional() }))
		.use(withLiveHostEvent)
		.handler(async ({ context, input }) => {
			const row = context.event;
			const bytes = await fileBytes(input.file);
			// The declared type is the client's word; the bytes decide.
			const type = sniffImage(bytes);
			if (!type) {
				throw new ORPCError("BAD_REQUEST", {
					message: "A JPEG, PNG or WebP, please.",
				});
			}
			const key = await putImage(context.env, "covers/", type, bytes, {
				eventId: row.id,
				uploadedBy: context.me.id,
			});
			// Optional, and dropped rather than refused if it isn't a JPEG: the
			// sender falls back to the cover itself when that is small enough.
			let mmsKey: string | null = null;
			if (input.mms) {
				const small = await fileBytes(input.mms);
				if (sniffImage(small) === "image/jpeg") {
					mmsKey = key.replace(/\.[a-z]+$/, "-mms.jpg");
					await context.env.MEDIA.put(mmsKey, small, {
						httpMetadata: { contentType: "image/jpeg" },
						customMetadata: { eventId: row.id, uploadedBy: context.me.id },
					});
				}
			}
			await context.db
				.update(event)
				.set({ coverKey: key, coverMmsKey: mmsKey })
				.where(eq(event.id, row.id));
			if (row.coverKey) await context.env.MEDIA.delete(row.coverKey);
			if (row.coverMmsKey) await context.env.MEDIA.delete(row.coverMmsKey);
			return { coverKey: key };
		}),

	removeCover: hostProcedure
		.input(idInput)
		.use(withLiveHostEvent)
		.handler(async ({ context }) => {
			const row = context.event;
			await context.db
				.update(event)
				.set({ coverKey: null, coverMmsKey: null })
				.where(eq(event.id, row.id));
			if (row.coverKey) await context.env.MEDIA.delete(row.coverKey);
			if (row.coverMmsKey) await context.env.MEDIA.delete(row.coverMmsKey);
			return { ok: true };
		}),
};
