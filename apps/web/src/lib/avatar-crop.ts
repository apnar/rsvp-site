/**
 * The profile-picture cropper's maths, pure so it can be tested. Lengths are
 * in units of the square viewport (its side is 1), so the state survives the
 * viewport changing size on a phone turning sideways. `x`/`y` is where the
 * picture's centre sits relative to the viewport's centre; `zoom` 1 is the
 * picture just covering the square. The screen and the exported JPEG are
 * drawn from the same numbers, so what was framed is what is saved.
 */

export type Size = { width: number; height: number };
export type Rotation = 0 | 90 | 180 | 270;
export type Crop = { zoom: number; x: number; y: number; rotation: Rotation };

export const MAX_ZOOM = 5;
export const START: Crop = { zoom: 1, x: 0, y: 0, rotation: 0 };

/** The picture's size as it stands, turned. */
function turned(img: Size, rotation: Rotation): Size {
	return rotation % 180 === 0 ? img : { width: img.height, height: img.width };
}

/** Viewport units per image pixel. The short side covers the square at zoom 1. */
function scaleOf(crop: Crop, img: Size): number {
	return crop.zoom / Math.min(img.width, img.height);
}

/** The picture's on-screen size, as fractions of the viewport. */
export function shownSize(crop: Crop, img: Size): Size {
	const s = scaleOf(crop, img);
	return { width: img.width * s, height: img.height * s };
}

/** Keep the zoom in range and the picture covering the whole square. */
export function clamp(crop: Crop, img: Size): Crop {
	const zoom = Math.min(MAX_ZOOM, Math.max(1, crop.zoom));
	const s = zoom / Math.min(img.width, img.height);
	const t = turned(img, crop.rotation);
	const room = (len: number) => Math.max(0, (len * s - 1) / 2);
	const within = (v: number, r: number) => Math.min(r, Math.max(-r, v));
	return {
		...crop,
		zoom,
		x: within(crop.x, room(t.width)),
		y: within(crop.y, room(t.height)),
	};
}

export function pan(crop: Crop, img: Size, dx: number, dy: number): Crop {
	return clamp({ ...crop, x: crop.x + dx, y: crop.y + dy }, img);
}

/**
 * Zoom by `factor` about `point` (viewport units from the centre), keeping
 * whatever is under the cursor or between the fingers where it is.
 */
export function zoomAt(
	crop: Crop,
	img: Size,
	factor: number,
	point = { x: 0, y: 0 },
): Crop {
	const zoom = Math.min(MAX_ZOOM, Math.max(1, crop.zoom * factor));
	const k = zoom / crop.zoom;
	return clamp(
		{
			...crop,
			zoom,
			x: point.x - (point.x - crop.x) * k,
			y: point.y - (point.y - crop.y) * k,
		},
		img,
	);
}

/** A quarter turn clockwise about the viewport's centre. */
export function rotate90(crop: Crop, img: Size): Crop {
	return clamp(
		{
			...crop,
			rotation: ((crop.rotation + 90) % 360) as Rotation,
			x: -crop.y,
			y: crop.x,
		},
		img,
	);
}

/**
 * How to draw the picture onto a `size`-pixel square: translate, rotate,
 * scale, then draw the image centred on the origin.
 */
export function exportTransform(crop: Crop, img: Size, size: number) {
	return {
		tx: size / 2 + crop.x * size,
		ty: size / 2 + crop.y * size,
		radians: (crop.rotation * Math.PI) / 180,
		scale: scaleOf(crop, img) * size,
	};
}
