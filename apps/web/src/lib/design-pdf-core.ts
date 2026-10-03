/**
 * Paper invitations from a design: the card face the host built, one per
 * guest, each with that guest's QR code and name.
 *
 * Pure like paper-pdf-core.ts -- font and image bytes come in as
 * arguments -- so it renders from Node (scripts/render-design-samples.ts).
 * It draws the same scene the page shows: every glyph at the x the
 * layout gave it, so the printed card breaks its lines where the screen
 * does.
 *
 * Whatever is the same on every card (the background and anything not
 * personal) is drawn once into a page of its own and placed on each sheet
 * as a form XObject; only the QR code and {guest} lines are drawn per
 * guest. A run of shared things above a personal one gets its own
 * XObject, so the stacking order is kept.
 */

import fontkit from "@pdf-lib/fontkit";
import { turnAbout } from "@rsvp-site/design/edit";
import type { Faces } from "@rsvp-site/design/faces";
import type { FaceKey } from "@rsvp-site/design/fonts";
import { type PatternShape, tiled } from "@rsvp-site/design/patterns";
import type { Values } from "@rsvp-site/design/placeholders";
import {
	type Box,
	dashOf,
	glyphsOf,
	layoutCard,
	type Scene,
	type SceneBackground,
	type SceneNode,
} from "@rsvp-site/design/scene";
import { type Design, FORMATS, type Stop } from "@rsvp-site/design/schema";
import {
	appendBezierCurve,
	clip,
	closePath,
	concatTransformationMatrix,
	endPath,
	lineTo,
	moveTo,
	PDFDict,
	PDFDocument,
	type PDFEmbeddedPage,
	type PDFFont,
	type PDFImage,
	PDFName,
	PDFOperator,
	type PDFOperatorNames,
	type PDFPage,
	type PDFPageDrawSVGOptions,
	popGraphicsState,
	pushGraphicsState,
	rectangle,
	rgb,
} from "pdf-lib";
import type { PrintLayout } from "./paper-sizes";
import { drawQr, hexColor } from "./pdf-qr";

const PT = 72;
/** A print shop's 1/8 inch. */
const BLEED_PT = 9;
/** Room outside the bleed for crop marks on an exact-size page. */
const SLUG_PT = 18;
const MARK_PT = 12;

export type DesignGuest = {
	id: string;
	name: string;
	firstName: string;
	lastName: string;
	url: string;
};

type DesignAssets = {
	/** Metrics, for the layout. */
	faces: Faces;
	/** The faces' .woff files, for embedding. */
	fonts: ReadonlyMap<FaceKey, ArrayBuffer>;
	/** Each image the design uses, as JPEG or PNG bytes, by ref. */
	images: ReadonlyMap<string, ArrayBuffer>;
};

type Ctx = {
	doc: PDFDocument;
	page: PDFPage;
	fonts: Map<FaceKey, PDFFont>;
	images: Map<string, PDFImage>;
	shadings: { n: number };
};

/** Where a card's trim sits on a sheet: its top-left corner, in points. */
type Slot = { ox: number; oyTop: number; s: number };

const KAPPA = 0.5522847498;

/**
 * A box's outline, y down from its top, once for both uses: painted as an
 * SVG path (pdf-lib strokes and fills those) and as operators to clip to
 * (it can't clip with a path).
 */
type Seg =
	| ["M" | "L", number, number]
	| ["C", number, number, number, number, number, number]
	| ["Z"];

function outline(
	shape: "rect" | "ellipse",
	w: number,
	h: number,
	r: number,
): Seg[] {
	if (shape === "rect" && r <= 0) {
		return [["M", 0, 0], ["L", w, 0], ["L", w, h], ["L", 0, h], ["Z"]];
	}
	if (shape === "rect") {
		const k = r * KAPPA;
		return [
			["M", r, 0],
			["L", w - r, 0],
			["C", w - r + k, 0, w, r - k, w, r],
			["L", w, h - r],
			["C", w, h - r + k, w - r + k, h, w - r, h],
			["L", r, h],
			["C", r - k, h, 0, h - r + k, 0, h - r],
			["L", 0, r],
			["C", 0, r - k, r - k, 0, r, 0],
			["Z"],
		];
	}
	const rx = w / 2;
	const ry = h / 2;
	const kx = rx * KAPPA;
	const ky = ry * KAPPA;
	return [
		["M", 0, ry],
		["C", 0, ry - ky, rx - kx, 0, rx, 0],
		["C", rx + kx, 0, w, ry - ky, w, ry],
		["C", w, ry + ky, rx + kx, h, rx, h],
		["C", rx - kx, h, 0, ry + ky, 0, ry],
		["Z"],
	];
}

function outlinePath(segs: readonly Seg[]): string {
	return segs.map((s) => s.join(s.length > 2 ? " " : "")).join(" ");
}

/** The outline as operators in the box's y-up frame, for clipping. */
function outlineOps(segs: readonly Seg[], h: number) {
	return segs.map((s) => {
		if (s[0] === "M") return moveTo(s[1], h - s[2]);
		if (s[0] === "L") return lineTo(s[1], h - s[2]);
		if (s[0] === "C") {
			return appendBezierCurve(s[1], h - s[2], s[3], h - s[4], s[5], h - s[6]);
		}
		return closePath();
	});
}

function shapeOutline(circle: boolean, w: number, h: number, r: number) {
	return outline(circle ? "ellipse" : "rect", w, h, r);
}

/**
 * Run `draw` in a box's own frame: origin at its bottom-left, y up, turned
 * about its centre as the page turns it. pdf-lib's drawing calls then work
 * in the box as they would on a page.
 */
function inBox(page: PDFPage, box: Box, draw: () => void) {
	const cx = box.x + box.w / 2;
	const cy = box.y + box.h / 2;
	const a = (box.rot * Math.PI) / 180;
	page.pushOperators(pushGraphicsState());
	if (box.rot) {
		page.pushOperators(
			concatTransformationMatrix(1, 0, 0, 1, cx, cy),
			concatTransformationMatrix(
				Math.cos(a),
				Math.sin(a),
				-Math.sin(a),
				Math.cos(a),
				0,
				0,
			),
			concatTransformationMatrix(1, 0, 0, 1, -cx, -cy),
		);
	}
	page.pushOperators(
		concatTransformationMatrix(1, 0, 0, -1, box.x, box.y + box.h),
	);
	draw();
	page.pushOperators(popGraphicsState());
}

/** A shape as an SVG path, with only the paints it has (pdf-lib fills black otherwise). */
function svgPaint(
	fill: string | null,
	stroke: string | null,
	sw: number,
	dash: number[] | null,
	opacity: number,
): PDFPageDrawSVGOptions {
	const o: PDFPageDrawSVGOptions = {};
	if (fill) {
		o.color = hexColor(fill);
		o.opacity = opacity;
	}
	if (stroke && sw > 0) {
		o.borderColor = hexColor(stroke);
		o.borderWidth = sw;
		o.borderOpacity = opacity;
		o.borderDashArray = dash ?? undefined;
	}
	return o;
}

function drawNode(ctx: Ctx, n: SceneNode, guestUrl: string) {
	const { page } = ctx;
	const { w, h } = n.box;
	inBox(page, n.box, () => {
		switch (n.k) {
			case "rect":
			case "ellipse": {
				const paint = svgPaint(n.fill, n.stroke, n.sw, dashOf(n), n.opacity);
				if (!paint.color && !paint.borderColor) return;
				page.drawSvgPath(
					outlinePath(
						n.k === "rect"
							? outline("rect", w, h, n.r)
							: outline("ellipse", w, h, 0),
					),
					{
						x: 0,
						y: h,
						...paint,
					},
				);
				return;
			}
			case "line":
				page.drawLine({
					start: { x: 0, y: h / 2 },
					end: { x: w, y: h / 2 },
					thickness: n.sw,
					color: hexColor(n.stroke),
					opacity: n.opacity,
					dashArray: dashOf(n) ?? undefined,
				});
				return;
			case "path":
				page.pushOperators(
					pushGraphicsState(),
					concatTransformationMatrix(w / n.vb, 0, 0, h / n.vb, 0, 0),
				);
				page.drawSvgPath(n.d, {
					x: 0,
					y: n.vb,
					color: hexColor(n.color),
					opacity: n.opacity,
				});
				page.pushOperators(popGraphicsState());
				return;
			case "image": {
				const image = ctx.images.get(n.ref);
				if (image) {
					page.pushOperators(
						pushGraphicsState(),
						...outlineOps(shapeOutline(n.mask === "circle", w, h, n.r), h),
						clip(),
						endPath(),
					);
					page.drawImage(image, {
						x: n.img.x,
						y: h - (n.img.y + n.img.h),
						width: n.img.w,
						height: n.img.h,
						opacity: n.opacity,
					});
					page.pushOperators(popGraphicsState());
				}
				if (n.border) {
					page.drawSvgPath(
						outlinePath(shapeOutline(n.mask === "circle", w, h, n.r)),
						{
							x: 0,
							y: h,
							...svgPaint(
								null,
								n.border.color,
								n.border.width,
								null,
								n.opacity,
							),
						},
					);
				}
				return;
			}
			case "text": {
				const font = ctx.fonts.get(n.face);
				if (!font) return;
				const { lines, passes } = glyphsOf(n);
				for (const pass of passes) {
					for (const line of lines) {
						for (const g of line) {
							page.drawText(g.c, {
								x: g.x + pass.dx,
								y: h - g.y - pass.dy,
								size: n.size,
								font,
								color: hexColor(pass.color),
								opacity: n.opacity,
							});
						}
					}
				}
				return;
			}
			case "qr":
				drawQr(
					page,
					guestUrl,
					{ x: 0, y: 0, size: Math.min(w, h) },
					{
						fg: hexColor(n.fg),
						bg: n.bg ? hexColor(n.bg) : null,
						opacity: n.opacity,
					},
				);
				return;
		}
	});
}

/** Stops from 0 to 1, as a PDF function wants them. */
function fullStops(stops: readonly Stop[]): Stop[] {
	const out = [...stops];
	const first = out[0];
	const last = out[out.length - 1];
	if (first && first.at > 0) out.unshift({ at: 0, color: first.color });
	if (last && last.at < 1) out.push({ at: 1, color: last.color });
	return out;
}

function rgbArray(hex: string): number[] {
	const c = hexColor(hex);
	return [c.red, c.green, c.blue];
}

/**
 * A gradient as a native PDF shading: smooth at any size, where a picture
 * of one would band or blur. pdf-lib has no API for these, so the
 * dictionaries are built by hand and painted with the `sh` operator.
 */
function paintShading(
	ctx: Ctx,
	type: 2 | 3,
	coords: number[],
	stops: readonly Stop[],
) {
	const { doc, page } = ctx;
	const st = fullStops(stops);
	const fns = st.slice(1).map((b, i) =>
		doc.context.obj({
			FunctionType: 2,
			Domain: [0, 1],
			C0: rgbArray(st[i]?.color ?? b.color),
			C1: rgbArray(b.color),
			N: 1,
		}),
	);
	const fn =
		fns.length === 1 && fns[0]
			? fns[0]
			: doc.context.obj({
					FunctionType: 3,
					Domain: [0, 1],
					Functions: fns,
					Bounds: st.slice(1, -1).map((s) => s.at),
					Encode: fns.flatMap(() => [0, 1]),
				});
	const shading = doc.context.register(
		doc.context.obj({
			ShadingType: type,
			ColorSpace: "DeviceRGB",
			Coords: coords,
			Function: fn,
			Extend: [true, true],
		}),
	);
	const resources = page.node.Resources();
	if (!resources) return;
	let dict = resources.lookupMaybe(PDFName.of("Shading"), PDFDict);
	if (!dict) {
		dict = doc.context.obj({});
		resources.set(PDFName.of("Shading"), dict);
	}
	ctx.shadings.n += 1;
	const name = `Sh${ctx.shadings.n}`;
	dict.set(PDFName.of(name), shading);
	page.pushOperators(
		PDFOperator.of("sh" as PDFOperatorNames, [PDFName.of(name)]),
	);
}

/**
 * Pattern shapes as one SVG path per colour, in the area's coordinates
 * (y down from its top-left), turned by the pattern's angle about the
 * card's centre the way the page's <pattern> is.
 */
function patternPaths(
	shapes: readonly PatternShape[],
	angle: number,
	scene: Scene,
): Map<string, string> {
	const { area } = scene;
	const centre = { x: scene.w / 2, y: scene.h / 2 };
	const paths = new Map<string, string[]>();
	const f = (n: number) => Math.round(n * 100) / 100;
	for (const s of shapes) {
		let d: string;
		if (s.k === "circle") {
			const c = turnAbout({ x: s.x, y: s.y }, centre, angle);
			const x = c.x - area.x;
			const y = c.y - area.y;
			d = `M${f(x - s.r)},${f(y)} a${f(s.r)},${f(s.r)} 0 1,0 ${f(2 * s.r)},0 a${f(s.r)},${f(s.r)} 0 1,0 ${f(-2 * s.r)},0 Z`;
		} else {
			const mx = s.x + s.w / 2;
			const my = s.y + s.h / 2;
			const corners = [
				[s.x, s.y],
				[s.x + s.w, s.y],
				[s.x + s.w, s.y + s.h],
				[s.x, s.y + s.h],
			].map(([x = 0, y = 0]) => {
				const own = turnAbout({ x, y }, { x: mx, y: my }, s.rot);
				const p = turnAbout(own, centre, angle);
				return `${f(p.x - area.x)},${f(p.y - area.y)}`;
			});
			d = `M${corners.join(" L")} Z`;
		}
		const list = paths.get(s.color) ?? [];
		list.push(d);
		paths.set(s.color, list);
	}
	return new Map([...paths].map(([c, list]) => [c, list.join(" ")]));
}

function drawBackground(ctx: Ctx, scene: Scene, bg: SceneBackground) {
	const { page } = ctx;
	const { area } = scene;
	const box = { ...area, rot: 0 };
	const W = area.w;
	const H = area.h;
	// Card units to this box's frame (origin bottom-left, y up).
	const lx = (u: number) => u - area.x;
	const ly = (v: number) => area.y + area.h - v;
	inBox(page, box, () => {
		switch (bg.k) {
			case "solid":
				page.drawRectangle({
					x: 0,
					y: 0,
					width: W,
					height: H,
					color: hexColor(bg.color),
				});
				return;
			case "linear":
				paintShading(
					ctx,
					2,
					[lx(bg.x1), ly(bg.y1), lx(bg.x2), ly(bg.y2)],
					bg.stops,
				);
				return;
			case "radial":
				paintShading(
					ctx,
					3,
					[lx(bg.cx), ly(bg.cy), 0, lx(bg.cx), ly(bg.cy), bg.r],
					bg.stops,
				);
				return;
			case "image": {
				const image = ctx.images.get(bg.ref);
				if (image) {
					page.drawImage(image, {
						x: lx(bg.img.x),
						y: ly(bg.img.y + bg.img.h),
						width: bg.img.w,
						height: bg.img.h,
					});
				}
				if (bg.tint) {
					page.drawRectangle({
						x: 0,
						y: 0,
						width: W,
						height: H,
						color: hexColor(bg.tint.color),
						opacity: bg.tint.opacity,
					});
				}
				return;
			}
			case "pattern": {
				page.drawRectangle({
					x: 0,
					y: 0,
					width: W,
					height: H,
					color: hexColor(bg.color),
				});
				const shapes = bg.tile
					? tiled(bg.tile, scene.w, scene.h, scene.bleed)
					: bg.pieces;
				const paths = patternPaths(shapes, bg.tile?.angle ?? 0, scene);
				for (const [color, d] of paths) {
					page.drawSvgPath(d, { x: 0, y: H, color: hexColor(color) });
				}
				return;
			}
		}
	});
}

/**
 * Draw part of a card into a slot: the trim's top-left at (ox, oyTop) in
 * points, `s` points to the card unit. Clipped to the card (and its bleed).
 */
function drawCard(
	ctx: Ctx,
	scene: Scene,
	nodes: readonly SceneNode[],
	slot: Slot,
	background: boolean,
	guestUrl: string,
) {
	const { page } = ctx;
	const { area } = scene;
	page.pushOperators(
		pushGraphicsState(),
		concatTransformationMatrix(slot.s, 0, 0, -slot.s, slot.ox, slot.oyTop),
		rectangle(area.x, area.y, area.w, area.h),
		clip(),
		endPath(),
	);
	if (background) drawBackground(ctx, scene, scene.background);
	for (const n of nodes) drawNode(ctx, n, guestUrl);
	page.pushOperators(popGraphicsState());
}

async function embedAssets(
	ctx: Ctx,
	assets: DesignAssets,
	scene: Scene,
	nodes: readonly SceneNode[],
	background: boolean,
) {
	for (const n of nodes) {
		if (n.k === "text" && !ctx.fonts.has(n.face)) {
			const bytes = assets.fonts.get(n.face);
			if (!bytes) throw new Error(`No font file for ${n.face}`);
			ctx.fonts.set(
				n.face,
				await ctx.doc.embedFont(bytes, {
					subset: true,
					features: { liga: false, calt: false, clig: false, dlig: false },
				}),
			);
		}
	}
	const refs = nodes.flatMap((n) => (n.k === "image" ? [n.ref] : []));
	if (background && scene.background.k === "image")
		refs.push(scene.background.ref);
	for (const ref of refs) {
		if (ctx.images.has(ref)) continue;
		const bytes = assets.images.get(ref);
		if (!bytes) continue;
		// PNG starts \x89PNG; anything else here is a JPEG.
		const png = new Uint8Array(bytes.slice(0, 4))[1] === 0x50;
		ctx.images.set(
			ref,
			png ? await ctx.doc.embedPng(bytes) : await ctx.doc.embedJpg(bytes),
		);
	}
}

function newCtx(doc: PDFDocument, page: PDFPage): Ctx {
	return { doc, page, fonts: new Map(), images: new Map(), shadings: { n: 0 } };
}

type Sheet = {
	size: [number, number];
	/** Bottom-left corner of each card's trim. */
	slots: { x: number; y: number }[];
	marks: boolean;
	cutLine: { x: number } | { y: number } | null;
};

function sheetFor(layout: PrintLayout, W: number, H: number, b: number): Sheet {
	const LETTER: [number, number] = [8.5 * PT, 11 * PT];
	if (layout === "on-letter") {
		const [sw, sh] = LETTER;
		return {
			size: LETTER,
			slots: [{ x: (sw - W) / 2, y: (sh - H) / 2 }],
			marks: true,
			cutLine: null,
		};
	}
	if (layout === "two-up") {
		if (W <= H) {
			const size: [number, number] = [11 * PT, 8.5 * PT];
			const gap = (size[0] - 2 * W) / 3;
			const y = (size[1] - H) / 2;
			return {
				size,
				slots: [
					{ x: gap, y },
					{ x: 2 * gap + W, y },
				],
				marks: gap > 1,
				cutLine: gap > 1 ? null : { x: size[0] / 2 },
			};
		}
		const gap = (LETTER[1] - 2 * H) / 3;
		const x = (LETTER[0] - W) / 2;
		return {
			size: LETTER,
			// Top card first.
			slots: [
				{ x, y: 2 * gap + H },
				{ x, y: gap },
			],
			marks: gap > 1,
			cutLine: gap > 1 ? null : { y: LETTER[1] / 2 },
		};
	}
	const m = b > 0 ? SLUG_PT : 0;
	return {
		size: [W + 2 * (b + m), H + 2 * (b + m)],
		slots: [{ x: b + m, y: b + m }],
		marks: b > 0,
		cutLine: null,
	};
}

/** Marks at each corner of the trim, standing off the bleed. */
function drawMarks(
	page: PDFPage,
	x: number,
	y: number,
	W: number,
	H: number,
	b: number,
) {
	const off = b + 3;
	const color = rgb(0, 0, 0);
	const line = (x1: number, y1: number, x2: number, y2: number) =>
		page.drawLine({
			start: { x: x1, y: y1 },
			end: { x: x2, y: y2 },
			thickness: 0.25,
			color,
		});
	for (const cx of [x, x + W]) {
		const dir = cx === x ? -1 : 1;
		for (const cy of [y, y + H]) {
			const dirY = cy === y ? -1 : 1;
			line(cx + dir * off, cy, cx + dir * (off + MARK_PT), cy);
			line(cx, cy + dirY * off, cx, cy + dirY * (off + MARK_PT));
		}
	}
}

/** Shared and per-guest nodes in stacking order, shared ones grouped. */
function runsOf(
	nodes: readonly SceneNode[],
): { dynamic: boolean; nodes: SceneNode[] }[] {
	const runs: { dynamic: boolean; nodes: SceneNode[] }[] = [];
	for (const n of nodes) {
		const last = runs[runs.length - 1];
		if (last && last.dynamic === n.dynamic) last.nodes.push(n);
		else runs.push({ dynamic: n.dynamic, nodes: [n] });
	}
	if (runs[0]?.dynamic !== false) runs.unshift({ dynamic: false, nodes: [] });
	return runs;
}

export async function layoutDesignInvites(input: {
	design: Design;
	/** The event's facts; {guest}, {first name} and {last name} are filled per card. */
	values: Values;
	guests: DesignGuest[];
	layout: PrintLayout;
	assets: DesignAssets;
	title: string;
}): Promise<Uint8Array> {
	const { design, assets } = input;
	const format = FORMATS[design.format];
	const W = format.w * PT;
	const H = format.h * PT;
	const sheetNoBleed = design.format === "half" && input.layout === "two-up";
	const bleed = design.bleed && !sheetNoBleed;
	const b = bleed ? BLEED_PT : 0;
	const s = W / 1000;
	const sceneFor = (guest: DesignGuest | undefined) =>
		layoutCard(design, {
			values: {
				...input.values,
				guest: guest?.name ?? "",
				guestFirst: guest?.firstName ?? "",
				guestLast: guest?.lastName ?? "",
			},
			mode: "paper",
			faces: assets.faces,
			bleed,
		});

	// The shared runs, each drawn once on a page of a scratch document.
	const base = sceneFor(input.guests[0]);
	const runs = runsOf(base.nodes);
	const scratch = await PDFDocument.create();
	scratch.registerFontkit(fontkit);
	const scratchCtx = newCtx(scratch, scratch.addPage([W + 2 * b, H + 2 * b]));
	const staticRuns = runs.filter((r) => !r.dynamic);
	for (const [i, run] of staticRuns.entries()) {
		const page =
			i === 0 ? scratchCtx.page : scratch.addPage([W + 2 * b, H + 2 * b]);
		const ctx = { ...scratchCtx, page };
		await embedAssets(ctx, assets, base, run.nodes, i === 0);
		drawCard(ctx, base, run.nodes, { ox: b, oyTop: H + b, s }, i === 0, "");
	}
	// Saving fixes the font subsets; loading it back lets the output embed
	// each page, fonts and all, as one reusable object.
	const shared = await PDFDocument.load(await scratch.save());

	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	doc.setTitle(`${input.title} – invitations`);
	doc.setCreator("Botch RSVP");
	const pieces: PDFEmbeddedPage[] = await doc.embedPages(shared.getPages());

	const sheet = sheetFor(input.layout, W, H, b);
	const perSheet = sheet.slots.length;
	let outCtx: Ctx | null = null;
	for (let g = 0; g < input.guests.length; g += perSheet) {
		const page = doc.addPage(sheet.size);
		const ctx: Ctx = outCtx ? { ...outCtx, page } : newCtx(doc, page);
		outCtx = ctx;
		for (const [slotIndex, guest] of input.guests
			.slice(g, g + perSheet)
			.entries()) {
			const slot = sheet.slots[slotIndex];
			if (!slot) continue;
			const scene = sceneFor(guest);
			let piece = 0;
			for (const run of runsOf(scene.nodes)) {
				if (!run.dynamic) {
					const embedded = pieces[piece++];
					if (embedded) {
						page.drawPage(embedded, {
							x: slot.x - b,
							y: slot.y - b,
							width: W + 2 * b,
							height: H + 2 * b,
						});
					}
					continue;
				}
				await embedAssets(ctx, assets, scene, run.nodes, false);
				drawCard(
					ctx,
					scene,
					run.nodes,
					{ ox: slot.x, oyTop: slot.y + H, s },
					false,
					guest.url,
				);
			}
			if (sheet.marks) drawMarks(page, slot.x, slot.y, W, H, b);
		}
		if (sheet.cutLine) {
			const [sw, sh] = sheet.size;
			const c = sheet.cutLine;
			page.drawLine({
				start: "x" in c ? { x: c.x, y: 0 } : { x: 0, y: c.y },
				end: "x" in c ? { x: c.x, y: sh } : { x: sw, y: c.y },
				thickness: 0.5,
				color: rgb(0xe4 / 255, 0xde / 255, 0xf0 / 255),
				dashArray: [4, 4],
			});
		}
	}
	return doc.save();
}
