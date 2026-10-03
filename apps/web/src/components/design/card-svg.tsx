import type { FaceKey } from "@rsvp-site/design/fonts";
import type { tiled } from "@rsvp-site/design/patterns";
import type {
	Scene,
	SceneBackground,
	SceneNode,
	TextNode,
} from "@rsvp-site/design/scene";
import { type ReactNode, useId } from "react";
import { fontFaceCss } from "@/lib/design-font-css";
import { designSrc } from "@/lib/format";

/**
 * A laid-out design as inline SVG: the card on the guest page, in the
 * designer and in the template picker. Everything is placed from the
 * scene -- every glyph at its own x -- so the browser's own text layout
 * never gets a say, and the card matches the PDF and the email image.
 */
export function CardSvg({
	scene,
	label,
	className,
	children,
}: {
	scene: Scene;
	/** What the card says, for screen readers. */
	label?: string;
	className?: string;
	/** Drawn on top, in card units: the designer's handles. */
	children?: ReactNode;
}) {
	const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
	const { area } = scene;
	return (
		<svg
			viewBox={`${area.x} ${area.y} ${area.w} ${area.h}`}
			className={className}
			role="img"
			aria-label={label ?? textOf(scene)}
			xmlns="http://www.w3.org/2000/svg"
		>
			<defs>
				{/* The card brings its own fonts, wherever it is shown. Only
				    registry faces go in (see design-font-css.ts). */}
				<style>{fontFaceCss(facesIn(scene))}</style>
				<clipPath id={`${uid}-card`}>
					<rect x={area.x} y={area.y} width={area.w} height={area.h} />
				</clipPath>
			</defs>
			<g clipPath={`url(#${uid}-card)`}>
				<Background bg={scene.background} scene={scene} uid={uid} />
				{scene.nodes.map((n) => (
					<Node key={n.id} node={n} uid={uid} />
				))}
			</g>
			{children}
		</svg>
	);
}

function facesIn(scene: Scene): FaceKey[] {
	return [
		...new Set(scene.nodes.flatMap((n) => (n.k === "text" ? [n.face] : []))),
	];
}

export function textOf(scene: Scene): string {
	return scene.nodes
		.flatMap((n) => (n.k === "text" && n.content.trim() ? [n.content] : []))
		.join(". ");
}

function Stops({ stops }: { stops: { at: number; color: string }[] }) {
	return stops.map((s, i) => (
		<stop key={i} offset={s.at} stopColor={s.color} />
	));
}

function Background({
	bg,
	scene,
	uid,
}: {
	bg: SceneBackground;
	scene: Scene;
	uid: string;
}) {
	const { area } = scene;
	const fillRect = (fill: string) => (
		<rect x={area.x} y={area.y} width={area.w} height={area.h} fill={fill} />
	);
	switch (bg.k) {
		case "solid":
			return fillRect(bg.color);
		case "linear":
			return (
				<>
					<defs>
						<linearGradient
							id={`${uid}-bg`}
							gradientUnits="userSpaceOnUse"
							x1={bg.x1}
							y1={bg.y1}
							x2={bg.x2}
							y2={bg.y2}
						>
							<Stops stops={bg.stops} />
						</linearGradient>
					</defs>
					{fillRect(`url(#${uid}-bg)`)}
				</>
			);
		case "radial":
			return (
				<>
					<defs>
						<radialGradient
							id={`${uid}-bg`}
							gradientUnits="userSpaceOnUse"
							cx={bg.cx}
							cy={bg.cy}
							r={bg.r}
						>
							<Stops stops={bg.stops} />
						</radialGradient>
					</defs>
					{fillRect(`url(#${uid}-bg)`)}
				</>
			);
		case "image":
			return (
				<>
					<image
						href={designSrc(bg.ref)}
						x={bg.img.x}
						y={bg.img.y}
						width={bg.img.w}
						height={bg.img.h}
						preserveAspectRatio="none"
					/>
					{bg.tint ? (
						<rect
							x={area.x}
							y={area.y}
							width={area.w}
							height={area.h}
							fill={bg.tint.color}
							opacity={bg.tint.opacity}
						/>
					) : null}
				</>
			);
		case "pattern": {
			if (!bg.tile) {
				return (
					<>
						{fillRect(bg.color)}
						{bg.pieces.map((p, i) => (
							<Piece key={i} shape={p} />
						))}
					</>
				);
			}
			const t = bg.tile;
			return (
				<>
					<defs>
						<pattern
							id={`${uid}-bg`}
							patternUnits="userSpaceOnUse"
							width={t.w}
							height={t.h}
							patternTransform={`rotate(${t.angle} ${scene.w / 2} ${scene.h / 2})`}
						>
							{t.shapes.map((p, i) => (
								<Piece key={i} shape={p} />
							))}
						</pattern>
					</defs>
					{fillRect(bg.color)}
					{fillRect(`url(#${uid}-bg)`)}
				</>
			);
		}
	}
}

function Piece({ shape: p }: { shape: ReturnType<typeof tiled>[number] }) {
	if (p.k === "circle")
		return <circle cx={p.x} cy={p.y} r={p.r} fill={p.color} />;
	return (
		<rect
			x={p.x}
			y={p.y}
			width={p.w}
			height={p.h}
			fill={p.color}
			transform={
				p.rot ? `rotate(${p.rot} ${p.x + p.w / 2} ${p.y + p.h / 2})` : undefined
			}
		/>
	);
}

function dashOf(dash: boolean, sw: number): string | undefined {
	return dash ? `${sw * 3} ${sw * 2}` : undefined;
}

export function Node({ node: n, uid }: { node: SceneNode; uid: string }) {
	const { x, y, w, h, rot } = n.box;
	const transform = rot
		? `rotate(${rot} ${x + w / 2} ${y + h / 2})`
		: undefined;
	let body: ReactNode = null;
	// Opacity goes on each drawn primitive, as the canvas and the PDF do it,
	// not on the group: a fill and its stroke, or a text and its shadow,
	// would otherwise composite as one flattened shape and look different.
	const o = n.opacity === 1 ? undefined : n.opacity;
	switch (n.k) {
		case "rect":
			body = (
				<rect
					x={x}
					y={y}
					width={w}
					height={h}
					rx={n.r}
					fill={n.fill ?? "none"}
					fillOpacity={o}
					stroke={n.stroke ?? undefined}
					strokeOpacity={o}
					strokeWidth={n.stroke ? n.sw : undefined}
					strokeDasharray={n.stroke ? dashOf(n.dash, n.sw) : undefined}
				/>
			);
			break;
		case "ellipse":
			body = (
				<ellipse
					cx={x + w / 2}
					cy={y + h / 2}
					rx={w / 2}
					ry={h / 2}
					fill={n.fill ?? "none"}
					fillOpacity={o}
					stroke={n.stroke ?? undefined}
					strokeOpacity={o}
					strokeWidth={n.stroke ? n.sw : undefined}
					strokeDasharray={n.stroke ? dashOf(n.dash, n.sw) : undefined}
				/>
			);
			break;
		case "line":
			body = (
				<line
					x1={x}
					y1={y + h / 2}
					x2={x + w}
					y2={y + h / 2}
					stroke={n.stroke}
					strokeOpacity={o}
					strokeWidth={n.sw}
					strokeDasharray={dashOf(n.dash, n.sw)}
				/>
			);
			break;
		case "path":
			body = (
				<path
					d={n.d}
					fill={n.color}
					fillOpacity={o}
					transform={`translate(${x} ${y}) scale(${w / n.vb} ${h / n.vb})`}
				/>
			);
			break;
		case "image": {
			const clip = `${uid}-${n.id}`;
			const shape =
				n.mask === "circle" ? (
					<ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} />
				) : (
					<rect x={x} y={y} width={w} height={h} rx={n.r} />
				);
			body = (
				<>
					<defs>
						<clipPath id={clip}>{shape}</clipPath>
					</defs>
					<image
						href={designSrc(n.ref)}
						x={x + n.img.x}
						y={y + n.img.y}
						width={n.img.w}
						height={n.img.h}
						preserveAspectRatio="none"
						opacity={o}
						clipPath={`url(#${clip})`}
					/>
					{n.border ? (
						n.mask === "circle" ? (
							<ellipse
								cx={x + w / 2}
								cy={y + h / 2}
								rx={w / 2}
								ry={h / 2}
								fill="none"
								stroke={n.border.color}
								strokeOpacity={o}
								strokeWidth={n.border.width}
							/>
						) : (
							<rect
								x={x}
								y={y}
								width={w}
								height={h}
								rx={n.r}
								fill="none"
								stroke={n.border.color}
								strokeOpacity={o}
								strokeWidth={n.border.width}
							/>
						)
					) : null}
				</>
			);
			break;
		}
		case "text":
			body = (
				<>
					{n.shadow ? (
						<Glyphs
							node={n}
							dx={n.shadow.dx}
							dy={n.shadow.dy}
							color={n.shadow.color}
							opacity={o}
						/>
					) : null}
					<Glyphs node={n} dx={0} dy={0} color={n.color} opacity={o} />
				</>
			);
			break;
		case "qr": {
			// The code differs per guest and is only ever printed; the designer
			// shows where it goes, with the three corner squares of a real one.
			const m = w / 7;
			const finder = (fx: number, fy: number) => (
				<g key={`${fx}${fy}`}>
					<rect
						x={fx}
						y={fy}
						width={m * 1.6}
						height={m * 1.6}
						fill={n.fg}
						fillOpacity={o}
					/>
					<rect
						x={fx + m * 0.25}
						y={fy + m * 0.25}
						width={m * 1.1}
						height={m * 1.1}
						fill={n.bg ?? "#ffffff"}
						fillOpacity={o}
					/>
					<rect
						x={fx + m * 0.5}
						y={fy + m * 0.5}
						width={m * 0.6}
						height={m * 0.6}
						fill={n.fg}
						fillOpacity={o}
					/>
				</g>
			);
			body = (
				<>
					<rect
						x={x}
						y={y}
						width={w}
						height={h}
						fill={n.bg ?? "none"}
						fillOpacity={o}
					/>
					{finder(x + m * 0.5, y + m * 0.5)}
					{finder(x + w - m * 2.1, y + m * 0.5)}
					{finder(x + m * 0.5, y + h - m * 2.1)}
					<rect
						x={x + m * 2.6}
						y={y + m * 2.6}
						width={m * 1.8}
						height={m * 1.8}
						fill={n.fg}
						fillOpacity={0.35 * n.opacity}
					/>
				</>
			);
			break;
		}
	}
	return <g transform={transform}>{body}</g>;
}

const TEXT_STYLE = {
	fontKerning: "none",
	fontVariantLigatures: "none",
	fontFeatureSettings: '"liga" 0, "calt" 0, "kern" 0',
} as const;

/**
 * One <text> per line with an x for every glyph. Spaces are left out:
 * SVG collapses them, which would shift every x after them by one.
 */
function Glyphs({
	node: n,
	dx,
	dy,
	color,
	opacity,
}: {
	node: TextNode;
	dx: number;
	dy: number;
	color: string;
	opacity: number | undefined;
}) {
	return (
		<text
			fontFamily={`"${n.family}"`}
			fontWeight={n.weight}
			fontStyle={n.italic ? "italic" : undefined}
			fontSize={n.size}
			fill={color}
			fillOpacity={opacity}
			style={TEXT_STYLE}
			aria-hidden
		>
			{n.lines.map((line, i) => {
				const xs: number[] = [];
				let chars = "";
				line.chars.forEach((c, j) => {
					if (c === " ") return;
					chars += c;
					xs.push(n.box.x + (line.xs[j] ?? 0) + dx);
				});
				if (!chars) return null;
				return (
					<tspan key={i} x={xs.join(" ")} y={n.box.y + line.y + dy}>
						{chars}
					</tspan>
				);
			})}
		</text>
	);
}
