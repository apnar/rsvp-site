/**
 * Redraw an image no larger than `max` pixels on its long side. The one
 * place the browser's decode-and-recompress dance lives: a phone camera's
 * 12-megapixel original is slow to send and slower to load in every inbox,
 * pdf-lib embeds only JPEG and PNG, and a design wants to know whether a
 * picture has transparency before it picks a format (`type` may be a
 * function of the drawn canvas for that). Throws if the browser cannot
 * decode or encode it; callers choose their own fallback.
 */
export async function scaleImage(
	source: Blob,
	opts: {
		max?: number;
		type:
			| string
			| ((ctx: CanvasRenderingContext2D, w: number, h: number) => string);
		quality?: number;
	},
): Promise<{ blob: Blob; width: number; height: number }> {
	const bitmap = await createImageBitmap(source);
	const scale = Math.min(
		1,
		(opts.max ?? Number.POSITIVE_INFINITY) /
			Math.max(bitmap.width, bitmap.height),
	);
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(bitmap.width * scale));
	canvas.height = Math.max(1, Math.round(bitmap.height * scale));
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("This browser can't prepare images.");
	ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	const type =
		typeof opts.type === "function"
			? opts.type(ctx, canvas.width, canvas.height)
			: opts.type;
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(
			resolve,
			type,
			type === "image/png" ? undefined : opts.quality,
		),
	);
	if (!blob) throw new Error("That image couldn't be read.");
	return { blob, width: canvas.width, height: canvas.height };
}

/**
 * A cover photo, scaled down before it goes up. Falls back to the original
 * if the browser cannot decode it.
 */
export async function shrinkCover(file: File, max = 1600): Promise<File> {
	try {
		const { blob } = await scaleImage(file, {
			max,
			type: "image/jpeg",
			quality: 0.85,
		});
		return new File([blob], "cover.jpg", { type: "image/jpeg" });
	} catch {
		return file;
	}
}

/**
 * An image for a design, scaled down in the browser before it goes up, and
 * its size, which the design records so a crop can be worked out anywhere.
 * A picture with transparency (a logo, a cut-out) stays a PNG; anything
 * else becomes a JPEG.
 */
export async function shrinkForDesign(
	file: File,
	max = 2000,
): Promise<{ file: File; width: number; height: number }> {
	const { blob, width, height } = await scaleImage(file, {
		max,
		type: (ctx, w, h) =>
			file.type !== "image/jpeg" && hasTransparency(ctx, w, h)
				? "image/png"
				: "image/jpeg",
		quality: 0.86,
	});
	const png = blob.type === "image/png";
	return {
		file: new File([blob], png ? "image.png" : "image.jpg", {
			type: blob.type,
		}),
		width,
		height,
	};
}

function hasTransparency(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
): boolean {
	const data = ctx.getImageData(0, 0, w, h).data;
	for (let i = 3; i < data.length; i += 4 * 7) {
		if ((data[i] ?? 255) < 250) return true;
	}
	return false;
}

/** The pixel size of an image already uploaded. */
export function naturalSize(
	src: string,
): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () =>
			resolve({ width: img.naturalWidth, height: img.naturalHeight });
		img.onerror = () => reject(new Error("That image didn't load."));
		img.src = src;
	});
}
