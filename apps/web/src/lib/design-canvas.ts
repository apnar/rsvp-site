/**
 * The card as one JPEG, drawn in the browser: what emails, link previews
 * and the dashboard show. It draws the same scene as the page and the PDF,
 * glyph by glyph, with the guest's name and the QR code left out, since
 * one picture goes to everybody.
 *
 * Loaded with a dynamic import; nothing here runs on the server.
 */
import { facesOf, loadFaces } from "@rsvp-site/design/faces";
import { family } from "@rsvp-site/design/fonts";
import { tiled } from "@rsvp-site/design/patterns";
import type { Values } from "@rsvp-site/design/placeholders";
import {
	layoutCard,
	type Scene,
	type SceneBackground,
	type SceneNode,
} from "@rsvp-site/design/scene";
import { type Design, refsOf } from "@rsvp-site/design/schema";
import { FONT_FILES } from "./design-fonts.gen";
import { designSrc } from "./format";

const WIDTH = 1200;

async function loadFonts(scene: Scene) {
	const faces = new Map<string, SceneNode & { k: "text" }>();
	for (const n of scene.nodes) if (n.k === "text") faces.set(n.face, n);
	await Promise.all(
		[...faces].map(async ([key, n]) => {
			const files = FONT_FILES[n.face];
			if (!files) return;
			const face = new FontFace(family(n.font), `url(${files.woff2})`, {
				weight: String(n.weight),
			});
			await face.load();
			document.fonts.add(face);
			return key;
		}),
	);
}

function loadImage(ref: string): Promise<HTMLImageElement | null> {
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => resolve(null);
		img.src = designSrc(ref);
	});
}

function gradient(g: CanvasGradient, stops: { at: number; color: string }[]) {
	for (const s of stops) g.addColorStop(s.at, s.color);
	return g;
}

function drawBackground(
	ctx: CanvasRenderingContext2D,
	scene: Scene,
	bg: SceneBackground,
	images: Map<string, HTMLImageElement>,
) {
	const { x, y, w, h } = scene.area;
	switch (bg.k) {
		case "solid":
			ctx.fillStyle = bg.color;
			ctx.fillRect(x, y, w, h);
			return;
		case "linear":
			ctx.fillStyle = gradient(
				ctx.createLinearGradient(bg.x1, bg.y1, bg.x2, bg.y2),
				bg.stops,
			);
			ctx.fillRect(x, y, w, h);
			return;
		case "radial":
			ctx.fillStyle = gradient(
				ctx.createRadialGradient(bg.cx, bg.cy, 0, bg.cx, bg.cy, bg.r),
				bg.stops,
			);
			ctx.fillRect(x, y, w, h);
			return;
		case "image": {
			const img = images.get(bg.ref);
			if (img) ctx.drawImage(img, bg.img.x, bg.img.y, bg.img.w, bg.img.h);
			if (bg.tint) {
				ctx.globalAlpha = bg.tint.opacity;
				ctx.fillStyle = bg.tint.color;
				ctx.fillRect(x, y, w, h);
				ctx.globalAlpha = 1;
			}
			return;
		}
		case "pattern": {
			ctx.fillStyle = bg.color;
			ctx.fillRect(x, y, w, h);
			ctx.save();
			if (bg.tile) {
				ctx.translate(scene.w / 2, scene.h / 2);
				ctx.rotate((bg.tile.angle * Math.PI) / 180);
				ctx.translate(-scene.w / 2, -scene.h / 2);
			}
			const shapes = bg.tile
				? tiled(bg.tile, scene.w, scene.h, scene.bleed)
				: bg.pieces;
			for (const s of shapes) {
				ctx.fillStyle = s.color;
				if (s.k === "circle") {
					ctx.beginPath();
					ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
					ctx.fill();
				} else {
					ctx.save();
					ctx.translate(s.x + s.w / 2, s.y + s.h / 2);
					ctx.rotate((s.rot * Math.PI) / 180);
					ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
					ctx.restore();
				}
			}
			ctx.restore();
			return;
		}
	}
}

function shapePath(
	ctx: CanvasRenderingContext2D,
	n: SceneNode,
	circle: boolean,
	r: number,
) {
	const { x, y, w, h } = n.box;
	ctx.beginPath();
	if (circle)
		ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
	else ctx.roundRect(x, y, w, h, r);
}

function paint(
	ctx: CanvasRenderingContext2D,
	fill: string | null,
	stroke: string | null,
	sw: number,
	dash: boolean,
) {
	if (fill) {
		ctx.fillStyle = fill;
		ctx.fill();
	}
	if (stroke && sw > 0) {
		ctx.strokeStyle = stroke;
		ctx.lineWidth = sw;
		ctx.setLineDash(dash ? [sw * 3, sw * 2] : []);
		ctx.stroke();
		ctx.setLineDash([]);
	}
}

function drawNode(
	ctx: CanvasRenderingContext2D,
	n: SceneNode,
	images: Map<string, HTMLImageElement>,
) {
	const { x, y, w, h, rot } = n.box;
	ctx.save();
	if (rot) {
		ctx.translate(x + w / 2, y + h / 2);
		ctx.rotate((rot * Math.PI) / 180);
		ctx.translate(-(x + w / 2), -(y + h / 2));
	}
	ctx.globalAlpha = n.opacity;
	switch (n.k) {
		case "rect":
			shapePath(ctx, n, false, n.r);
			paint(ctx, n.fill, n.stroke, n.sw, n.dash);
			break;
		case "ellipse":
			shapePath(ctx, n, true, 0);
			paint(ctx, n.fill, n.stroke, n.sw, n.dash);
			break;
		case "line":
			ctx.beginPath();
			ctx.moveTo(x, y + h / 2);
			ctx.lineTo(x + w, y + h / 2);
			paint(ctx, null, n.stroke, n.sw, n.dash);
			break;
		case "path":
			ctx.translate(x, y);
			ctx.scale(w / n.vb, h / n.vb);
			ctx.fillStyle = n.color;
			ctx.fill(new Path2D(n.d));
			break;
		case "image": {
			const img = images.get(n.ref);
			ctx.save();
			shapePath(ctx, n, n.mask === "circle", n.r);
			ctx.clip();
			if (img) ctx.drawImage(img, x + n.img.x, y + n.img.y, n.img.w, n.img.h);
			ctx.restore();
			if (n.border) {
				shapePath(ctx, n, n.mask === "circle", n.r);
				paint(ctx, null, n.border.color, n.border.width, false);
			}
			break;
		}
		case "text": {
			ctx.font = `${n.weight} ${n.size}px "${n.family}"`;
			ctx.textBaseline = "alphabetic";
			ctx.fontKerning = "none";
			const glyphs = (dx: number, dy: number, color: string) => {
				ctx.fillStyle = color;
				for (const line of n.lines) {
					line.chars.forEach((c, i) => {
						if (c !== " ")
							ctx.fillText(c, x + (line.xs[i] ?? 0) + dx, y + line.y + dy);
					});
				}
			};
			if (n.shadow) glyphs(n.shadow.dx, n.shadow.dy, n.shadow.color);
			glyphs(0, 0, n.color);
			break;
		}
		case "qr":
			break;
	}
	ctx.restore();
}

/** The shared card image for a design and the event's facts. */
export async function renderCard(
	design: Design,
	values: Values,
): Promise<Blob> {
	const faces = await loadFaces(facesOf(design));
	const scene = layoutCard(design, {
		values: { ...values, guest: "" },
		mode: "image",
		faces,
	});
	const [, loaded] = await Promise.all([
		loadFonts(scene),
		Promise.all(
			[...new Set(refsOf(design))].map(
				async (r) => [r, await loadImage(r)] as const,
			),
		),
	]);
	const images = new Map(
		loaded.flatMap(([r, img]) => (img ? [[r, img] as const] : [])),
	);
	const canvas = document.createElement("canvas");
	const k = WIDTH / scene.w;
	canvas.width = WIDTH;
	canvas.height = Math.round(scene.h * k);
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("This browser can't draw the card.");
	ctx.scale(k, k);
	ctx.beginPath();
	ctx.rect(0, 0, scene.w, scene.h);
	ctx.clip();
	drawBackground(ctx, scene, scene.background, images);
	for (const n of scene.nodes) drawNode(ctx, n, images);
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, "image/jpeg", 0.9),
	);
	if (!blob) throw new Error("The card image didn't draw.");
	return blob;
}
