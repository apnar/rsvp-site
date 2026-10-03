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
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(bitmap.width * scale));
	canvas.height = Math.max(1, Math.round(bitmap.height * scale));
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("This browser can't prepare images.");
	ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	const png =
		file.type !== "image/jpeg" &&
		hasTransparency(ctx, canvas.width, canvas.height);
	const type = png ? "image/png" : "image/jpeg";
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, type, png ? undefined : 0.86),
	);
	if (!blob) throw new Error("That image couldn't be read.");
	return {
		file: new File([blob], png ? "image.png" : "image.jpg", { type }),
		width: canvas.width,
		height: canvas.height,
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
