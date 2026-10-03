import type { tiled } from "@rsvp-site/design/patterns";
import type {
	Scene,
	SceneBackground,
	SceneNode,
	TextNode,
} from "@rsvp-site/design/scene";
import { type ReactNode, useId } from "react";
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

export function textOf(scene: Scene): string {
	return scene.nodes
		.flatMap((n) => (n.k === "text" && n.content.trim() ? [n.content] : []))
		.join(". ");
}

function Stops({ stops }: { stops: { at: number; color: string }[] }) {
	return stops.map((s, i) => (
		// biome-ignore lint/suspicious/noArrayIndexKey: stops have no identity of their own
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
							// biome-ignore lint/suspicious/noArrayIndexKey: pieces are positional
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
								// biome-ignore lint/suspicious/noArrayIndexKey: shapes are positional
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
					stroke={n.stroke ?? undefined}
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
					stroke={n.stroke ?? undefined}
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
						/>
					) : null}
					<Glyphs node={n} dx={0} dy={0} color={n.color} />
				</>
			);
			break;
		case "qr":
			// The code is per guest and only printed; the page has no use for it.
			body = (
				<rect
					x={x}
					y={y}
					width={w}
					height={h}
					fill={n.bg ?? "none"}
					stroke={n.fg}
					strokeDasharray="12 8"
					strokeWidth={4}
				/>
			);
			break;
	}
	return (
		<g transform={transform} opacity={n.opacity === 1 ? undefined : n.opacity}>
			{body}
		</g>
	);
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
}: {
	node: TextNode;
	dx: number;
	dy: number;
	color: string;
}) {
	return (
		<text
			fontFamily={`"${n.family}"`}
			fontWeight={n.weight}
			fontSize={n.size}
			fill={color}
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
					// biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
					<tspan key={i} x={xs.join(" ")} y={n.box.y + line.y + dy}>
						{chars}
					</tspan>
				);
			})}
		</text>
	);
}
