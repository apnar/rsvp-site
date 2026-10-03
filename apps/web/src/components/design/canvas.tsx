/**
 * The card being designed, with the means to grab things: a hit area per
 * element, the selection's handles, and snapping guides. All of it is
 * drawn in card units over the card itself, so what you drag is exactly
 * what prints.
 */
import {
	bounds,
	boxPoint,
	type Guide,
	HANDLES,
	type Handle,
	type HandleName,
	type Point,
	resize,
	rotation,
	snap,
	snapTargets,
} from "@rsvp-site/design/edit";
import type { Box, Scene } from "@rsvp-site/design/scene";
import { BOUNDS, type Design, type Element } from "@rsvp-site/design/schema";
import { cn } from "@rsvp-site/ui/lib/utils";
import { type Dispatch, type PointerEvent, useRef, useState } from "react";
import { CardSvg } from "./card-svg";
import { type EditorAction, updateEls } from "./editor-state";

type Gesture =
	| {
			kind: "move";
			before: Design;
			start: Point;
			origins: Map<string, Box>;
			moved: boolean;
	  }
	| {
			kind: "resize";
			before: Design;
			id: string;
			handle: Handle;
			origin: Element;
	  }
	| { kind: "rotate"; before: Design; id: string; origin: Element };

/** Things that keep their proportions unless Shift says otherwise. */
function keepsAspect(el: Element): boolean {
	return el.type === "image" || el.type === "sticker" || el.type === "qr";
}

function handlesOf(el: Element): HandleName[] {
	if (el.type === "line") return ["w", "e"];
	if (el.type === "qr") return ["nw", "ne", "se", "sw"];
	return Object.keys(HANDLES) as HandleName[];
}

export function DesignCanvas({
	doc,
	scene,
	selected,
	dispatch,
	showBleed,
	onEditText,
	className,
}: {
	doc: Design;
	scene: Scene;
	selected: string[];
	dispatch: Dispatch<EditorAction>;
	showBleed: boolean;
	onEditText: (id: string) => void;
	className?: string;
}) {
	const wrap = useRef<HTMLDivElement>(null);
	const gesture = useRef<Gesture | null>(null);
	const [guides, setGuides] = useState<Guide[]>([]);
	const [upp, setUpp] = useState(1);

	const svg = () => wrap.current?.querySelector("svg") ?? null;
	const toUnits = (e: { clientX: number; clientY: number }): Point => {
		const el = svg();
		const ctm = el?.getScreenCTM();
		if (!el || !ctm) return { x: 0, y: 0 };
		const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
		return { x: p.x, y: p.y };
	};
	/** Card units per screen pixel, for handle sizes and snap distance. */
	const unitsPerPixel = () => {
		const a = svg()?.getScreenCTM()?.a;
		return a ? 1 / a : 1;
	};

	const sel = doc.elements.filter((e) => selected.includes(e.id));
	const one = sel.length === 1 ? sel[0] : undefined;

	function begin(e: PointerEvent, g: Gesture) {
		gesture.current = g;
		setUpp(unitsPerPixel());
		wrap.current?.setPointerCapture(e.pointerId);
		e.stopPropagation();
	}

	function onElementDown(e: PointerEvent, el: Element) {
		if (e.button !== 0) return;
		const ids = e.shiftKey
			? selected.includes(el.id)
				? selected.filter((id) => id !== el.id)
				: [...selected, el.id]
			: selected.includes(el.id)
				? selected
				: [el.id];
		dispatch({ t: "select", ids });
		const moving = doc.elements.filter((x) => ids.includes(x.id) && !x.locked);
		if (moving.length === 0) return;
		begin(e, {
			kind: "move",
			before: doc,
			start: toUnits(e),
			origins: new Map(
				moving.map((x) => [
					x.id,
					{ x: x.x, y: x.y, w: x.w, h: x.h, rot: x.rot },
				]),
			),
			moved: false,
		});
	}

	function onMove(e: PointerEvent) {
		const g = gesture.current;
		if (!g) return;
		const p = toUnits(e);
		const u = unitsPerPixel();
		if (g.kind === "move") {
			let dx = p.x - g.start.x;
			let dy = p.y - g.start.y;
			if (!g.moved && Math.hypot(dx, dy) < 3 * u) return;
			g.moved = true;
			const boxes = [...g.origins.values()].map((b) => bounds(b));
			const union = {
				x: Math.min(...boxes.map((b) => b.x)) + dx,
				y: Math.min(...boxes.map((b) => b.y)) + dy,
				w: 0,
				h: 0,
			};
			union.w = Math.max(...boxes.map((b) => b.x + b.w)) + dx - union.x;
			union.h = Math.max(...boxes.map((b) => b.y + b.h)) + dy - union.y;
			let found: Guide[] = [];
			if (!e.altKey) {
				const others = g.before.elements.filter(
					(x) => !g.origins.has(x.id) && !x.hidden,
				);
				const s = snap(
					union,
					snapTargets(
						{ w: scene.w, h: scene.h, bleed: showBleed ? scene.bleed : 0 },
						others,
					),
					6 * u,
				);
				dx += s.dx;
				dy += s.dy;
				found = s.guides;
			}
			setGuides(found);
			dispatch({
				t: "live",
				doc: updateEls(g.before, [...g.origins.keys()], (el) => {
					const o = g.origins.get(el.id);
					return o ? { ...el, x: o.x + dx, y: o.y + dy } : el;
				}),
			});
			return;
		}
		if (g.kind === "resize") {
			const o = g.origin;
			const corner = g.handle.hx !== 0 && g.handle.hy !== 0;
			const textScale = o.type === "text" && corner;
			const keep = textScale || keepsAspect(o) !== e.shiftKey;
			const b = resize(o, g.handle, p, keep);
			dispatch({
				t: "live",
				doc: updateEls(g.before, [o.id], (el) =>
					el.type === "text" && textScale
						? {
								...el,
								...b,
								size: Math.max(
									BOUNDS.textSize.min,
									Math.min(BOUNDS.textSize.max, (el.size * b.w) / o.w),
								),
							}
						: el.type === "qr"
							? { ...el, ...b, h: b.w }
							: { ...el, ...b },
				),
			});
			return;
		}
		const rot = rotation(g.origin, p, e.shiftKey);
		dispatch({
			t: "live",
			doc: updateEls(g.before, [g.id], (el) => ({ ...el, rot })),
		});
	}

	function onUp() {
		const g = gesture.current;
		gesture.current = null;
		setGuides([]);
		if (g) dispatch({ t: "commit", before: g.before });
	}

	const handle = 10 * upp;
	const lime = "var(--color-lime)";
	const outline = (b: Box, dashed = false) => (
		<rect
			x={b.x}
			y={b.y}
			width={b.w}
			height={b.h}
			transform={
				b.rot ? `rotate(${b.rot} ${b.x + b.w / 2} ${b.y + b.h / 2})` : undefined
			}
			fill="none"
			stroke={lime}
			strokeWidth={1.5}
			strokeDasharray={dashed ? "4 4" : undefined}
			vectorEffect="non-scaling-stroke"
			pointerEvents="none"
		/>
	);

	return (
		<div
			ref={wrap}
			className={cn("relative touch-none select-none", className)}
			onPointerMove={onMove}
			onPointerUp={onUp}
			onPointerCancel={onUp}
			onPointerDown={() => setUpp(unitsPerPixel())}
		>
			<CardSvg
				scene={scene}
				label="The card you're designing"
				className="block h-auto w-full overflow-visible shadow-float"
			>
				<rect
					x={scene.area.x}
					y={scene.area.y}
					width={scene.area.w}
					height={scene.area.h}
					fill="transparent"
					onPointerDown={(e) => {
						if (e.button === 0 && !e.shiftKey)
							dispatch({ t: "select", ids: [] });
					}}
				/>
				{showBleed && scene.bleed ? (
					<g pointerEvents="none">
						{outline({ x: 0, y: 0, w: scene.w, h: scene.h, rot: 0 }, true)}
						<rect
							x={scene.bleed}
							y={scene.bleed}
							width={scene.w - 2 * scene.bleed}
							height={scene.h - 2 * scene.bleed}
							fill="none"
							stroke="var(--color-pink)"
							strokeOpacity={0.6}
							strokeWidth={1}
							strokeDasharray="2 4"
							vectorEffect="non-scaling-stroke"
						/>
					</g>
				) : null}
				{doc.elements.map((el) =>
					el.hidden ? null : (
						// Grabbed with a pointer; the keyboard reaches each element
						// through the layers list instead.
						// biome-ignore lint/a11y/noStaticElementInteractions: see above
						<rect
							key={el.id}
							data-id={el.id}
							x={el.x}
							y={el.y}
							width={el.w}
							height={Math.max(el.h, el.type === "line" ? 24 * upp : 0)}
							transform={
								el.rot
									? `rotate(${el.rot} ${el.x + el.w / 2} ${el.y + el.h / 2})`
									: undefined
							}
							fill="transparent"
							className={el.locked ? "cursor-default" : "cursor-move"}
							onPointerDown={(e) => onElementDown(e, el)}
							onDoubleClick={() => {
								if (el.type === "text") onEditText(el.id);
							}}
						/>
					),
				)}
				{sel.map((el) => (
					<g key={el.id}>{outline(el, el.locked)}</g>
				))}
				{one && !one.locked ? (
					<g>
						{handlesOf(one).map((name) => {
							const h = HANDLES[name];
							const c = boxPoint(one, {
								x: (h.hx * one.w) / 2,
								y: (h.hy * one.h) / 2,
							});
							return (
								<rect
									key={name}
									x={c.x - handle / 2}
									y={c.y - handle / 2}
									width={handle}
									height={handle}
									rx={handle / 4}
									transform={
										one.rot ? `rotate(${one.rot} ${c.x} ${c.y})` : undefined
									}
									fill="var(--color-ink)"
									stroke={lime}
									strokeWidth={1.5}
									vectorEffect="non-scaling-stroke"
									className="cursor-crosshair"
									onPointerDown={(e) =>
										begin(e, {
											kind: "resize",
											before: doc,
											id: one.id,
											handle: h,
											origin: one,
										})
									}
								/>
							);
						})}
						{(() => {
							const top = boxPoint(one, { x: 0, y: -one.h / 2 });
							const knob = boxPoint(one, { x: 0, y: -one.h / 2 - 28 * upp });
							return (
								<>
									<line
										x1={top.x}
										y1={top.y}
										x2={knob.x}
										y2={knob.y}
										stroke={lime}
										strokeWidth={1.5}
										vectorEffect="non-scaling-stroke"
										pointerEvents="none"
									/>
									<circle
										cx={knob.x}
										cy={knob.y}
										r={handle * 0.65}
										fill={lime}
										stroke="var(--color-ink)"
										strokeWidth={1.5}
										vectorEffect="non-scaling-stroke"
										className="cursor-grab"
										aria-label="Turn"
										onPointerDown={(e) =>
											begin(e, {
												kind: "rotate",
												before: doc,
												id: one.id,
												origin: one,
											})
										}
									/>
								</>
							);
						})()}
					</g>
				) : null}
				{guides.map((g) => (
					<line
						key={`${g.axis}${g.at}`}
						x1={g.axis === "x" ? g.at : scene.area.x}
						x2={g.axis === "x" ? g.at : scene.area.x + scene.area.w}
						y1={g.axis === "y" ? g.at : scene.area.y}
						y2={g.axis === "y" ? g.at : scene.area.y + scene.area.h}
						stroke="var(--color-pink)"
						strokeWidth={1}
						vectorEffect="non-scaling-stroke"
						pointerEvents="none"
					/>
				))}
			</CardSvg>
		</div>
	);
}
