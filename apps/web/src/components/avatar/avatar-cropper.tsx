import { Button } from "@rsvp-site/ui/components/button";
import { RotateCw } from "lucide-react";
import {
	type Dispatch,
	type KeyboardEvent,
	type PointerEvent,
	type SetStateAction,
	useEffect,
	useId,
	useRef,
} from "react";

import {
	type Crop,
	MAX_ZOOM,
	pan,
	rotate90,
	START,
	shownSize,
	zoomAt,
} from "@/lib/avatar-crop";

type Point = { x: number; y: number };

/**
 * Framing a profile picture: drag to move, pinch, wheel or the slider to
 * zoom, a quarter turn at a time. The picture is a canvas painted once and
 * moved with CSS, from the same `Crop` the export draws with. `touch-none`
 * keeps a drag from scrolling the page underneath on a phone.
 */
export function AvatarCropper({
	bitmap,
	crop,
	setCrop,
}: {
	bitmap: ImageBitmap;
	crop: Crop;
	setCrop: Dispatch<SetStateAction<Crop>>;
}) {
	const id = useId();
	const viewRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const pointers = useRef(new Map<number, Point>());
	const img = { width: bitmap.width, height: bitmap.height };

	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		ctx.drawImage(bitmap, 0, 0);
	}, [bitmap]);

	// React's wheel listener is passive, so it can't stop the page scrolling.
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const at = toView(view, e.clientX, e.clientY);
			const factor = Math.exp(-e.deltaY * 0.002);
			setCrop((c) => zoomAt(c, bitmap, factor, at));
		};
		view.addEventListener("wheel", onWheel, { passive: false });
		return () => view.removeEventListener("wheel", onWheel);
	}, [bitmap, setCrop]);

	function onPointerDown(e: PointerEvent<HTMLDivElement>) {
		e.currentTarget.setPointerCapture(e.pointerId);
		pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
	}

	function onPointerMove(e: PointerEvent<HTMLDivElement>) {
		const view = viewRef.current;
		const was = pointers.current.get(e.pointerId);
		if (!view || !was) return;
		const side = view.getBoundingClientRect().width;
		const before = [...pointers.current.values()];
		pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
		const after = [...pointers.current.values()];
		const [a0, b0] = before;
		const [a1, b1] = after;
		if (a0 && b0 && a1 && b1) {
			// Two fingers: zoom by how far apart they moved, about where
			// they are, and follow their midpoint.
			const factor = distance(a1, b1) / Math.max(1, distance(a0, b0));
			const m0 = midpoint(a0, b0);
			const m1 = midpoint(a1, b1);
			const at = toView(view, m1.x, m1.y);
			setCrop((c) =>
				pan(
					zoomAt(c, bitmap, factor, at),
					bitmap,
					(m1.x - m0.x) / side,
					(m1.y - m0.y) / side,
				),
			);
		} else if (pointers.current.size === 1) {
			setCrop((c) =>
				pan(c, bitmap, (e.clientX - was.x) / side, (e.clientY - was.y) / side),
			);
		}
	}

	function onPointerUp(e: PointerEvent<HTMLDivElement>) {
		pointers.current.delete(e.pointerId);
	}

	function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
		const step = 0.03;
		const moves: Record<string, [number, number]> = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, -step],
			ArrowDown: [0, step],
		};
		const move = moves[e.key];
		if (move) setCrop((c) => pan(c, bitmap, move[0], move[1]));
		else if (e.key === "+" || e.key === "=")
			setCrop((c) => zoomAt(c, bitmap, 1.1));
		else if (e.key === "-") setCrop((c) => zoomAt(c, bitmap, 1 / 1.1));
		else return;
		e.preventDefault();
	}

	const shown = shownSize(crop, img);
	return (
		<div className="flex flex-col gap-4">
			<div
				ref={viewRef}
				role="application"
				aria-label="Picture framing. Drag or use the arrow keys to move it, plus and minus to zoom."
				// biome-ignore lint/a11y/noNoninteractiveTabindex: the framing area takes arrow keys.
				tabIndex={0}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerUp}
				onKeyDown={onKeyDown}
				className="relative aspect-square w-full cursor-grab touch-none select-none overflow-hidden rounded-[26px] bg-night outline-none focus-visible:outline-2 focus-visible:outline-lime focus-visible:outline-offset-2 active:cursor-grabbing"
			>
				<canvas
					ref={canvasRef}
					className="pointer-events-none absolute max-w-none"
					style={{
						left: `${(0.5 + crop.x) * 100}%`,
						top: `${(0.5 + crop.y) * 100}%`,
						width: `${shown.width * 100}%`,
						height: `${shown.height * 100}%`,
						transform: `translate(-50%, -50%) rotate(${crop.rotation}deg)`,
					}}
				/>
				{/* Everything outside the circle is shaded: it is kept in the
				    square file but a round badge never shows it. */}
				<div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_color-mix(in_srgb,var(--color-night)_62%,transparent)] ring-2 ring-ink/70" />
			</div>
			<div className="flex flex-wrap items-center gap-3">
				<div className="flex flex-[1_1_220px] items-center gap-3">
					<label htmlFor={`${id}-zoom`} className="text-[13px] text-haze">
						Zoom
					</label>
					<input
						id={`${id}-zoom`}
						type="range"
						className="min-w-32 flex-1 accent-lime"
						min={1}
						max={MAX_ZOOM}
						step={0.01}
						value={crop.zoom}
						aria-valuetext={`${Math.round(crop.zoom * 100)}%`}
						onChange={(e) => {
							const zoom = Number(e.target.value);
							setCrop((c) => zoomAt(c, bitmap, zoom / c.zoom));
						}}
					/>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => setCrop((c) => rotate90(c, bitmap))}
				>
					<RotateCw aria-hidden />
					Turn
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => setCrop(START)}
				>
					Reset
				</Button>
			</div>
		</div>
	);
}

/** A screen point as viewport units from the viewport's centre. */
function toView(view: HTMLElement, clientX: number, clientY: number): Point {
	const r = view.getBoundingClientRect();
	return {
		x: (clientX - r.left) / r.width - 0.5,
		y: (clientY - r.top) / r.height - 0.5,
	};
}

function distance(a: Point, b: Point) {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
