import { type Design, refsOf } from "@rsvp-site/design/schema";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { designSrc } from "@/lib/design-src";
import { messageOf } from "@/lib/errors";
import { naturalSize, shrinkForDesign } from "@/lib/shrink-image";
import { client } from "@/utils/orpc";
import type { ImageTray } from "./editor-state";

/**
 * The event's design images, and the means to add one. Stable between
 * renders until the list or the upload state changes, so the panels that
 * take it as context do not follow every drag step.
 */
export function useImageTray(
	eventId: string,
	initial: Design,
	startImages: string[],
): ImageTray {
	// A template's own pictures were just uploaded, so they join the tray.
	const [images, setImages] = useState(() => [
		...new Set([...refsOf(initial), ...startImages]),
	]);
	const [uploading, setUploading] = useState(false);
	const sizes = useRef(new Map<string, { iw: number; ih: number }>());
	return useMemo(
		() => ({
			images,
			busy: uploading,
			sizeOf: async (ref) => {
				const known = sizes.current.get(ref);
				if (known) return known;
				const { width, height } = await naturalSize(designSrc(ref));
				const size = { iw: width, ih: height };
				sizes.current.set(ref, size);
				return size;
			},
			upload: async (file) => {
				setUploading(true);
				try {
					const shrunk = await shrinkForDesign(file);
					const { ref } = await client.designs.uploadImage({
						eventId,
						file: shrunk.file,
					});
					const size = { iw: shrunk.width, ih: shrunk.height };
					sizes.current.set(ref, size);
					setImages((list) => [ref, ...list.filter((r) => r !== ref)]);
					return { ref, ...size };
				} catch (error) {
					toast.error(messageOf(error));
					return null;
				} finally {
					setUploading(false);
				}
			},
		}),
		[eventId, images, uploading],
	);
}
