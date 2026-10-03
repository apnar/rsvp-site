/**
 * The designer's right-hand panel: the selected element's settings, or,
 * with nothing selected, the card's (its shape, background) and the page
 * theme the guest page takes from it.
 */
import { bounds } from "@rsvp-site/design/edit";
import {
	FONTS,
	type FontId,
	type FontInfo,
	hasItalic,
	nearestWeight,
} from "@rsvp-site/design/fonts";
import { PLACEHOLDERS } from "@rsvp-site/design/placeholders";
import {
	type Background,
	cardHeight,
	type Design,
	type DesignTheme,
	type Element,
	FORMAT_IDS,
	FORMATS,
	type Format,
	type ImageElement,
	type Stop,
	type TextElement,
} from "@rsvp-site/design/schema";
import {
	STICKER_IDS,
	STICKERS,
	type StickerId,
} from "@rsvp-site/design/stickers";
import { contrast, onColor } from "@rsvp-site/design/theme";
import { Button } from "@rsvp-site/ui/components/button";
import { cn } from "@rsvp-site/ui/lib/utils";
import { AlignCenter, AlignLeft, AlignRight, Plus, Trash2 } from "lucide-react";
import { type ReactNode, type RefObject, useState } from "react";
import { designSrc } from "@/lib/format";
import { patchEl, removeEls, updateEls } from "./editor-state";
import {
	Check,
	ColorField,
	FontField,
	NumberField,
	OptionalColor,
	Row,
	Segmented,
	SelectField,
	Slider,
} from "./fields";

export type SetDoc = (doc: Design, key?: string) => void;

export type ImageTray = {
	images: string[];
	upload: (
		file: File,
	) => Promise<{ ref: string; iw: number; ih: number } | null>;
	sizeOf: (ref: string) => Promise<{ iw: number; ih: number }>;
	busy: boolean;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-3 border-line border-t pt-4 first:border-t-0 first:pt-0">
			<h3 className="kicker m-0 text-haze">{title}</h3>
			{children}
		</section>
	);
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function ElementPanel({
	el,
	doc,
	set,
	paper,
	tray,
	textRef,
}: {
	el: Element;
	doc: Design;
	set: SetDoc;
	paper: boolean;
	tray: ImageTray;
	textRef: RefObject<HTMLTextAreaElement | null>;
}) {
	const patch = (p: Partial<Element>, key: string) =>
		set(patchEl(doc, el.id, p), `${el.id}:${key}`);
	return (
		<div className="flex flex-col gap-4">
			{el.type === "text" ? (
				<TextFields el={el} patch={patch} textRef={textRef} />
			) : null}
			{el.type === "image" ? (
				<ImageFields el={el} patch={patch} tray={tray} />
			) : null}
			{el.type === "rect" || el.type === "ellipse" ? (
				<Section title="Shape">
					<Row>
						<OptionalColor
							label="Fill"
							value={el.fill}
							fallback={doc.theme.accent}
							onChange={(fill) => patch({ fill }, "fill")}
						/>
						<OptionalColor
							label="Outline"
							value={el.stroke}
							fallback="#14101f"
							onChange={(stroke) =>
								patch(
									{
										stroke,
										strokeWidth: stroke && !el.strokeWidth ? 6 : el.strokeWidth,
									},
									"stroke",
								)
							}
						/>
					</Row>
					<Row>
						{el.stroke ? (
							<NumberField
								label="Outline width"
								value={el.strokeWidth}
								min={0}
								max={120}
								onChange={(strokeWidth) => patch({ strokeWidth }, "sw")}
							/>
						) : null}
						{el.type === "rect" ? (
							<NumberField
								label="Corner radius"
								value={el.radius}
								min={0}
								max={2000}
								onChange={(radius) => patch({ radius }, "radius")}
							/>
						) : null}
					</Row>
					{el.stroke ? (
						<Check
							label="Dashed outline"
							checked={el.dash}
							onChange={(dash) => patch({ dash }, "dash")}
						/>
					) : null}
				</Section>
			) : null}
			{el.type === "line" ? (
				<Section title="Line">
					<Row>
						<ColorField
							label="Colour"
							value={el.stroke}
							onChange={(stroke) => patch({ stroke }, "stroke")}
						/>
						<NumberField
							label="Thickness"
							value={el.strokeWidth}
							min={0.5}
							max={120}
							onChange={(strokeWidth) => patch({ strokeWidth }, "sw")}
						/>
					</Row>
					<Check
						label="Dashed"
						checked={el.dash}
						onChange={(dash) => patch({ dash }, "dash")}
					/>
				</Section>
			) : null}
			{el.type === "sticker" ? (
				<Section title="Sticker">
					<ColorField
						label="Colour"
						value={el.color}
						onChange={(color) => patch({ color }, "color")}
					/>
					<StickerGrid
						value={el.sticker}
						color={el.color}
						onPick={(sticker) => patch({ sticker }, "sticker")}
					/>
				</Section>
			) : null}
			{el.type === "qr" ? (
				<Section title="QR code">
					<p className="m-0 text-[13px] text-haze">
						Each printed card gets its guest's own code here. Keep it dark on
						light so phones can read it.
					</p>
					<Row>
						<ColorField
							label="Code"
							value={el.fg}
							onChange={(fg) => patch({ fg }, "fg")}
						/>
						<OptionalColor
							label="Behind"
							value={el.bg}
							fallback="#ffffff"
							onChange={(bg) => patch({ bg }, "bg")}
						/>
					</Row>
				</Section>
			) : null}
			<Section title="Placement">
				<Row className="grid-cols-4">
					<NumberField
						label="X"
						value={el.x}
						onChange={(x) => patch({ x }, "x")}
					/>
					<NumberField
						label="Y"
						value={el.y}
						onChange={(y) => patch({ y }, "y")}
					/>
					<NumberField
						label="Width"
						value={el.w}
						min={1}
						onChange={(w) => patch(el.type === "qr" ? { w, h: w } : { w }, "w")}
					/>
					<NumberField
						label="Height"
						value={el.h}
						min={1}
						onChange={(h) => patch(el.type === "qr" ? { w: h, h } : { h }, "h")}
					/>
				</Row>
				<Row>
					<NumberField
						label="Turn (°)"
						value={el.rot}
						min={-180}
						max={180}
						onChange={(rot) => patch({ rot }, "rot")}
					/>
					<Slider
						label="Opacity"
						value={el.opacity}
						min={0}
						max={1}
						step={0.05}
						format={pct}
						onChange={(opacity) => patch({ opacity }, "opacity")}
					/>
				</Row>
				{paper && el.type !== "qr" ? (
					<SelectField
						label="Where it shows"
						value={el.show}
						options={[
							{ value: "all", label: "Page and paper" },
							{ value: "paper", label: "Paper only" },
							{ value: "screen", label: "Page only" },
						]}
						onChange={(show) => patch({ show }, "show")}
					/>
				) : null}
				<div className="flex flex-wrap gap-4">
					<Check
						label="Locked"
						checked={el.locked}
						onChange={(locked) => patch({ locked }, "locked")}
					/>
					<Check
						label="Hidden"
						checked={el.hidden}
						onChange={(hidden) => patch({ hidden }, "hidden")}
					/>
				</div>
			</Section>
			<Button
				variant="destructive"
				size="sm"
				className="self-start"
				onClick={() => set(removeEls(doc, [el.id]))}
			>
				<Trash2 /> Delete
			</Button>
		</div>
	);
}

function TextFields({
	el,
	patch,
	textRef,
}: {
	el: TextElement;
	patch: (p: Partial<TextElement>, key: string) => void;
	textRef: RefObject<HTMLTextAreaElement | null>;
}) {
	const insert = (token: string) => {
		const ta = textRef.current;
		const at = ta?.selectionStart ?? el.text.length;
		const end = ta?.selectionEnd ?? at;
		const text = `${el.text.slice(0, at)}{${token}}${el.text.slice(end)}`;
		patch({ text }, "text");
		requestAnimationFrame(() => {
			ta?.focus();
			const caret = at + token.length + 2;
			ta?.setSelectionRange(caret, caret);
		});
	};
	const info: FontInfo = FONTS[el.font];
	const weights = (el.italic ? info.italics : info.weights) ?? info.weights;
	return (
		<>
			<Section title="Text">
				<textarea
					ref={textRef}
					value={el.text}
					maxLength={500}
					rows={3}
					onChange={(e) => patch({ text: e.target.value }, "text")}
					className="min-h-20 w-full rounded-[10px] border border-line-strong bg-night px-2.5 py-2 text-[15px] text-ink outline-none focus-visible:border-lime"
				/>
				<fieldset className="m-0 flex flex-wrap gap-1.5 border-0 p-0">
					<legend className="sr-only">Fill in from the event</legend>
					{PLACEHOLDERS.map((p) => (
						<button
							key={p}
							type="button"
							onClick={() => insert(p)}
							className="cursor-pointer rounded-full border border-line-strong bg-transparent px-2.5 py-1 text-[12px] text-soft hover:border-lime hover:text-ink"
						>
							{`{${p}}`}
						</button>
					))}
				</fieldset>
			</Section>
			<Section title="Type">
				<Row>
					<FontField
						label="Font"
						value={el.font}
						onChange={(font: FontId) => {
							const italic = el.italic && hasItalic(font);
							patch(
								{
									font,
									italic,
									weight: nearestWeight(font, el.weight, italic),
								},
								"font",
							);
						}}
					/>
					<SelectField
						label="Weight"
						value={String(el.weight)}
						options={weights.map((w) => ({
							value: String(w),
							label: weightName(w),
						}))}
						onChange={(w) => patch({ weight: Number(w) }, "weight")}
					/>
				</Row>
				<Row>
					<NumberField
						label="Size"
						value={el.size}
						min={4}
						max={800}
						onChange={(size) => patch({ size }, "size")}
					/>
					<ColorField
						label="Colour"
						value={el.color}
						onChange={(color) => patch({ color }, "color")}
					/>
				</Row>
				<Row>
					<Segmented
						label="Align"
						value={el.align}
						options={[
							{
								value: "left",
								label: <AlignLeft className="mx-auto size-4" />,
								title: "Left",
							},
							{
								value: "center",
								label: <AlignCenter className="mx-auto size-4" />,
								title: "Centre",
							},
							{
								value: "right",
								label: <AlignRight className="mx-auto size-4" />,
								title: "Right",
							},
						]}
						onChange={(align) => patch({ align }, "align")}
					/>
					<Segmented
						label="In its box"
						value={el.valign}
						options={[
							{ value: "top", label: "Top" },
							{ value: "middle", label: "Mid" },
							{ value: "bottom", label: "Foot" },
						]}
						onChange={(valign) => patch({ valign }, "valign")}
					/>
				</Row>
				<Row>
					<NumberField
						label="Line height"
						value={el.lineHeight}
						min={0.6}
						max={3}
						step={0.05}
						onChange={(lineHeight) => patch({ lineHeight }, "lh")}
					/>
					<NumberField
						label="Letter spacing"
						value={el.tracking}
						min={-0.2}
						max={1}
						step={0.01}
						onChange={(tracking) => patch({ tracking }, "tracking")}
					/>
				</Row>
				<div className="flex flex-wrap gap-4">
					{hasItalic(el.font) ? (
						<Check
							label="Italic"
							checked={el.italic}
							onChange={(italic) =>
								patch(
									{ italic, weight: nearestWeight(el.font, el.weight, italic) },
									"italic",
								)
							}
						/>
					) : null}
					<Check
						label="ALL CAPS"
						checked={el.upper}
						onChange={(upper) => patch({ upper }, "upper")}
					/>
					<Check
						label="Shrink to fit the box"
						checked={el.fit === "shrink"}
						onChange={(on) => patch({ fit: on ? "shrink" : "none" }, "fit")}
					/>
					<Check
						label="Shadow"
						checked={el.shadow !== null}
						onChange={(on) =>
							patch(
								{ shadow: on ? { color: "#000000", dx: 4, dy: 4 } : null },
								"shadow",
							)
						}
					/>
				</div>
				{el.shadow ? (
					<Row className="grid-cols-3">
						<ColorField
							label="Shadow"
							value={el.shadow.color}
							onChange={(color) =>
								el.shadow &&
								patch({ shadow: { ...el.shadow, color } }, "shadow")
							}
						/>
						<NumberField
							label="Across"
							value={el.shadow.dx}
							min={-60}
							max={60}
							onChange={(dx) =>
								el.shadow && patch({ shadow: { ...el.shadow, dx } }, "shadow")
							}
						/>
						<NumberField
							label="Down"
							value={el.shadow.dy}
							min={-60}
							max={60}
							onChange={(dy) =>
								el.shadow && patch({ shadow: { ...el.shadow, dy } }, "shadow")
							}
						/>
					</Row>
				) : null}
			</Section>
		</>
	);
}

function weightName(w: number): string {
	return (
		{
			100: "Thin",
			200: "Extra light",
			300: "Light",
			400: "Regular",
			500: "Medium",
			600: "Semibold",
			700: "Bold",
			800: "Extra bold",
			900: "Black",
		}[w] ?? String(w)
	);
}

function ImageFields({
	el,
	patch,
	tray,
}: {
	el: ImageElement;
	patch: (p: Partial<ImageElement>, key: string) => void;
	tray: ImageTray;
}) {
	return (
		<Section title="Image">
			<CropFields value={el} onChange={(p) => patch(p, "crop")} />
			<Segmented
				label="Shape"
				value={el.mask}
				options={[
					{ value: "none", label: "Square" },
					{ value: "rounded", label: "Rounded" },
					{ value: "circle", label: "Circle" },
				]}
				onChange={(mask) =>
					patch(
						{ mask, radius: mask === "rounded" && !el.radius ? 40 : el.radius },
						"mask",
					)
				}
			/>
			{el.mask === "rounded" ? (
				<NumberField
					label="Corner radius"
					value={el.radius}
					min={0}
					max={500}
					onChange={(radius) => patch({ radius }, "radius")}
				/>
			) : null}
			<Check
				label="Border"
				checked={el.border !== null}
				onChange={(on) =>
					patch(
						{ border: on ? { color: "#ffffff", width: 12 } : null },
						"border",
					)
				}
			/>
			{el.border ? (
				<Row>
					<ColorField
						label="Border"
						value={el.border.color}
						onChange={(color) =>
							el.border && patch({ border: { ...el.border, color } }, "border")
						}
					/>
					<NumberField
						label="Width"
						value={el.border.width}
						min={0}
						max={80}
						onChange={(width) =>
							el.border && patch({ border: { ...el.border, width } }, "border")
						}
					/>
				</Row>
			) : null}
			<ImagePicker
				tray={tray}
				label="Swap the picture"
				onPick={(ref, iw, ih) =>
					patch({ ref, iw, ih, fx: 0.5, fy: 0.5, zoom: 1 }, "ref")
				}
			/>
		</Section>
	);
}

/** Zoom and the point kept in view, for an image or a background photo. */
function CropFields({
	value,
	onChange,
}: {
	value: { fx: number; fy: number; zoom: number };
	onChange: (p: { fx?: number; fy?: number; zoom?: number }) => void;
}) {
	return (
		<>
			<Slider
				label="Zoom"
				value={value.zoom}
				min={1}
				max={5}
				step={0.05}
				format={(v) => `${v.toFixed(2)}×`}
				onChange={(zoom) => onChange({ zoom })}
			/>
			<Row>
				<Slider
					label="Across"
					value={value.fx}
					min={0}
					max={1}
					step={0.01}
					format={pct}
					onChange={(fx) => onChange({ fx })}
				/>
				<Slider
					label="Up and down"
					value={value.fy}
					min={0}
					max={1}
					step={0.01}
					format={pct}
					onChange={(fy) => onChange({ fy })}
				/>
			</Row>
		</>
	);
}

/** The event's uploaded images, and a button to add another. */
export function ImagePicker({
	tray,
	label,
	onPick,
}: {
	tray: ImageTray;
	label: string;
	onPick: (ref: string, iw: number, ih: number) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			<span className="text-[12px] text-haze">{label}</span>
			<div className="grid grid-cols-4 gap-1.5">
				{tray.images.map((ref) => (
					<button
						key={ref}
						type="button"
						className="aspect-square cursor-pointer overflow-hidden rounded-[8px] border border-line-strong bg-night p-0 hover:border-lime"
						onClick={async () => {
							const { iw, ih } = await tray.sizeOf(ref);
							onPick(ref, iw, ih);
						}}
					>
						<img
							src={designSrc(ref)}
							alt=""
							className="size-full object-cover"
							loading="lazy"
						/>
					</button>
				))}
				<label
					className={cn(
						"grid aspect-square cursor-pointer place-items-center rounded-[8px] border border-line-strong border-dashed text-haze hover:border-lime hover:text-ink",
						tray.busy && "pointer-events-none opacity-50",
					)}
					title="Upload an image"
				>
					<Plus className="size-5" />
					<span className="sr-only">Upload an image</span>
					<input
						type="file"
						accept="image/jpeg,image/png,image/webp"
						className="sr-only"
						onChange={async (e) => {
							const file = e.target.files?.[0];
							e.target.value = "";
							if (!file) return;
							const up = await tray.upload(file);
							if (up) onPick(up.ref, up.iw, up.ih);
						}}
					/>
				</label>
			</div>
		</div>
	);
}

export function StickerGrid({
	value,
	color,
	onPick,
}: {
	value?: StickerId;
	color: string;
	onPick: (s: StickerId) => void;
}) {
	return (
		<div className="grid grid-cols-6 gap-1">
			{STICKER_IDS.map((s) => (
				<button
					key={s}
					type="button"
					title={s.replace(/-/g, " ")}
					onClick={() => onPick(s)}
					className={cn(
						"grid aspect-square cursor-pointer place-items-center rounded-[8px] border border-transparent bg-transparent p-1 hover:border-line-strong",
						s === value && "border-lime",
					)}
				>
					<svg viewBox="0 0 256 256" className="size-full" aria-hidden>
						<path d={STICKERS[s]} fill={color} />
					</svg>
				</button>
			))}
		</div>
	);
}

/** Several selected: line them up, or remove them. */
export function MultiPanel({
	doc,
	ids,
	set,
}: {
	doc: Design;
	ids: string[];
	set: SetDoc;
}) {
	const els = doc.elements.filter((e) => ids.includes(e.id) && !e.locked);
	const boxes = els.map((e) => ({ id: e.id, b: bounds(e) }));
	const left = Math.min(...boxes.map((x) => x.b.x));
	const right = Math.max(...boxes.map((x) => x.b.x + x.b.w));
	const top = Math.min(...boxes.map((x) => x.b.y));
	const bottom = Math.max(...boxes.map((x) => x.b.y + x.b.h));
	const align = (
		fn: (b: { x: number; y: number; w: number; h: number }) => {
			dx: number;
			dy: number;
		},
	) =>
		set(
			updateEls(
				doc,
				els.map((e) => e.id),
				(e) => {
					const { dx, dy } = fn(bounds(e));
					return { ...e, x: e.x + dx, y: e.y + dy };
				},
			),
		);
	const btn = (label: string, fn: Parameters<typeof align>[0]) => (
		<Button variant="outline" size="sm" onClick={() => align(fn)}>
			{label}
		</Button>
	);
	return (
		<div className="flex flex-col gap-4">
			<Section title={`${ids.length} selected`}>
				<div className="flex flex-wrap gap-1.5">
					{btn("Left", (b) => ({ dx: left - b.x, dy: 0 }))}
					{btn("Centre", (b) => ({
						dx: (left + right) / 2 - (b.x + b.w / 2),
						dy: 0,
					}))}
					{btn("Right", (b) => ({ dx: right - (b.x + b.w), dy: 0 }))}
					{btn("Top", (b) => ({ dx: 0, dy: top - b.y }))}
					{btn("Middle", (b) => ({
						dx: 0,
						dy: (top + bottom) / 2 - (b.y + b.h / 2),
					}))}
					{btn("Bottom", (b) => ({ dx: 0, dy: bottom - (b.y + b.h) }))}
				</div>
			</Section>
			<Button
				variant="destructive"
				size="sm"
				className="self-start"
				onClick={() => set(removeEls(doc, ids))}
			>
				<Trash2 /> Delete all {ids.length}
			</Button>
		</div>
	);
}

/** Nothing selected: the card itself, and the page around it. */
export function CardPanel({
	doc,
	set,
	paper,
	tray,
}: {
	doc: Design;
	set: SetDoc;
	paper: boolean;
	tray: ImageTray;
}) {
	return (
		<div className="flex flex-col gap-4">
			<Section title="Card">
				<SelectField
					label="Shape"
					value={doc.format}
					options={FORMAT_IDS.map((f) => ({
						value: f,
						label: FORMATS[f].label,
					}))}
					onChange={(format: Format) => set(reshape(doc, format))}
				/>
				{paper ? (
					<Check
						label="Print-shop bleed (⅛ inch past the edge, with crop marks)"
						checked={doc.bleed}
						onChange={(bleed) => set({ ...doc, bleed })}
					/>
				) : null}
			</Section>
			<BackgroundFields doc={doc} set={set} tray={tray} />
			<ThemeFields doc={doc} set={set} />
		</div>
	);
}

/**
 * A new shape keeps everything's position relative to the card's height,
 * so a design doesn't fall off the bottom of a landscape card.
 */
function reshape(doc: Design, format: Format): Design {
	const k = cardHeight(format) / cardHeight(doc.format);
	if (k === 1) return doc;
	return {
		...doc,
		format,
		elements: doc.elements.map((e) => ({
			...e,
			y: (e.y + e.h / 2) * k - e.h / 2,
		})),
	};
}

const BG_KINDS = [
	{ value: "solid", label: "Colour" },
	{ value: "linear", label: "Fade" },
	{ value: "radial", label: "Glow" },
	{ value: "image", label: "Photo" },
	{ value: "pattern", label: "Pattern" },
] as const;

function switchBackground(
	doc: Design,
	kind: Background["kind"],
): Background | null {
	const from = doc.background;
	const base =
		from.kind === "solid" || from.kind === "pattern"
			? from.color
			: from.kind === "image"
				? doc.theme.bg
				: (from.stops[0]?.color ?? doc.theme.bg);
	switch (kind) {
		case "solid":
			return { kind, color: base };
		case "linear":
			return {
				kind,
				angle: 180,
				stops: [
					{ at: 0, color: base },
					{ at: 1, color: doc.theme.accent2 },
				],
			};
		case "radial":
			return {
				kind,
				cx: 0.5,
				cy: 0.35,
				r: 0.8,
				stops: [
					{ at: 0, color: doc.theme.accent2 },
					{ at: 1, color: base },
				],
			};
		case "pattern":
			return {
				kind,
				pattern: "dots",
				color: base,
				colors: [doc.theme.accent, doc.theme.accent2],
				scale: 1,
				angle: 0,
				seed: 1,
			};
		case "image":
			// Needs a photo picked first; see BackgroundFields.
			return null;
	}
}

function BackgroundFields({
	doc,
	set,
	tray,
}: {
	doc: Design;
	set: SetDoc;
	tray: ImageTray;
}) {
	const bg = doc.background;
	const put = (b: Background, key = "bg") =>
		set({ ...doc, background: b }, key);
	const [wantPhoto, setWantPhoto] = useState(false);
	const kind = wantPhoto ? "image" : bg.kind;
	return (
		<Section title="Background">
			<SelectField
				label="Kind"
				value={kind}
				options={BG_KINDS}
				onChange={(k) => {
					if (k === "image") {
						setWantPhoto(true);
						return;
					}
					setWantPhoto(false);
					const next = switchBackground(doc, k);
					if (next) put(next);
				}}
			/>
			{kind === "image" ? (
				<>
					{bg.kind === "image" ? (
						<>
							<CropFields
								value={bg}
								onChange={(p) => put({ ...bg, ...p }, "bgcrop")}
							/>
							<Check
								label="Tint over the photo"
								checked={bg.tint !== null}
								onChange={(on) =>
									put({
										...bg,
										tint: on ? { color: doc.theme.bg, opacity: 0.4 } : null,
									})
								}
							/>
							{bg.tint ? (
								<Row>
									<ColorField
										label="Tint"
										value={bg.tint.color}
										onChange={(color) =>
											bg.tint &&
											put({ ...bg, tint: { ...bg.tint, color } }, "tint")
										}
									/>
									<Slider
										label="Strength"
										value={bg.tint.opacity}
										min={0}
										max={0.95}
										step={0.05}
										format={pct}
										onChange={(opacity) =>
											bg.tint &&
											put({ ...bg, tint: { ...bg.tint, opacity } }, "tint")
										}
									/>
								</Row>
							) : null}
						</>
					) : null}
					<ImagePicker
						tray={tray}
						label={bg.kind === "image" ? "Swap the photo" : "Pick a photo"}
						onPick={(ref, iw, ih) => {
							setWantPhoto(false);
							put({
								kind: "image",
								ref,
								iw,
								ih,
								fx: 0.5,
								fy: 0.5,
								zoom: 1,
								tint: bg.kind === "image" ? bg.tint : null,
							});
						}}
					/>
				</>
			) : null}
			{kind === "solid" && bg.kind === "solid" ? (
				<ColorField
					label="Colour"
					value={bg.color}
					onChange={(color) => put({ ...bg, color }, "bgcolor")}
				/>
			) : null}
			{kind === "linear" && bg.kind === "linear" ? (
				<>
					<Slider
						label="Direction"
						value={bg.angle}
						min={0}
						max={360}
						step={5}
						format={(v) => `${v}°`}
						onChange={(angle) => put({ ...bg, angle }, "angle")}
					/>
					<StopsField
						stops={bg.stops}
						onChange={(stops) => put({ ...bg, stops }, "stops")}
					/>
				</>
			) : null}
			{kind === "radial" && bg.kind === "radial" ? (
				<>
					<Row>
						<Slider
							label="Across"
							value={bg.cx}
							min={0}
							max={1}
							step={0.01}
							format={pct}
							onChange={(cx) => put({ ...bg, cx }, "cx")}
						/>
						<Slider
							label="Down"
							value={bg.cy}
							min={0}
							max={1}
							step={0.01}
							format={pct}
							onChange={(cy) => put({ ...bg, cy }, "cy")}
						/>
					</Row>
					<Slider
						label="Reach"
						value={bg.r}
						min={0.05}
						max={2}
						step={0.05}
						format={pct}
						onChange={(r) => put({ ...bg, r }, "r")}
					/>
					<StopsField
						stops={bg.stops}
						onChange={(stops) => put({ ...bg, stops }, "stops")}
					/>
				</>
			) : null}
			{kind === "pattern" && bg.kind === "pattern" ? (
				<>
					<Row>
						<SelectField
							label="Pattern"
							value={bg.pattern}
							options={[
								{ value: "dots", label: "Dots" },
								{ value: "stripes", label: "Stripes" },
								{ value: "confetti", label: "Confetti" },
							]}
							onChange={(pattern) => put({ ...bg, pattern })}
						/>
						<ColorField
							label="Ground"
							value={bg.color}
							onChange={(color) => put({ ...bg, color }, "pcolor")}
						/>
					</Row>
					<ColorsField
						colors={bg.colors}
						onChange={(colors) => put({ ...bg, colors }, "pcolors")}
					/>
					<Row>
						<Slider
							label="Size"
							value={bg.scale}
							min={0.3}
							max={4}
							step={0.1}
							format={(v) => `${v.toFixed(1)}×`}
							onChange={(scale) => put({ ...bg, scale }, "pscale")}
						/>
						{bg.pattern === "confetti" ? (
							<div className="flex items-end">
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										put({ ...bg, seed: Math.floor(Math.random() * 2 ** 31) })
									}
								>
									Shuffle
								</Button>
							</div>
						) : (
							<Slider
								label="Angle"
								value={bg.angle}
								min={0}
								max={180}
								step={5}
								format={(v) => `${v}°`}
								onChange={(angle) => put({ ...bg, angle }, "pangle")}
							/>
						)}
					</Row>
				</>
			) : null}
		</Section>
	);
}

function StopsField({
	stops,
	onChange,
}: {
	stops: Stop[];
	onChange: (s: Stop[]) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			{stops.map((s, i) => (
				<div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
					<ColorField
						label={`Colour ${i + 1}`}
						value={s.color}
						onChange={(color) =>
							onChange(stops.map((x, j) => (j === i ? { ...x, color } : x)))
						}
					/>
					<Slider
						label="At"
						value={s.at}
						min={0}
						max={1}
						step={0.01}
						format={pct}
						onChange={(at) =>
							onChange(stops.map((x, j) => (j === i ? { ...x, at } : x)))
						}
					/>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Remove colour"
						disabled={stops.length <= 2}
						onClick={() => onChange(stops.filter((_, j) => j !== i))}
					>
						<Trash2 />
					</Button>
				</div>
			))}
			{stops.length < 5 ? (
				<Button
					variant="outline"
					size="sm"
					className="self-start"
					onClick={() =>
						onChange([
							...stops,
							{ at: 1, color: stops[stops.length - 1]?.color ?? "#ffffff" },
						])
					}
				>
					<Plus /> Add a colour
				</Button>
			) : null}
		</div>
	);
}

function ColorsField({
	colors,
	onChange,
}: {
	colors: string[];
	onChange: (c: string[]) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			{colors.map((c, i) => (
				<div key={i} className="grid grid-cols-[1fr_auto] items-end gap-2">
					<ColorField
						label={`Colour ${i + 1}`}
						value={c}
						onChange={(v) => onChange(colors.map((x, j) => (j === i ? v : x)))}
					/>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Remove colour"
						disabled={colors.length <= 1}
						onClick={() => onChange(colors.filter((_, j) => j !== i))}
					>
						<Trash2 />
					</Button>
				</div>
			))}
			{colors.length < 5 ? (
				<Button
					variant="outline"
					size="sm"
					className="self-start"
					onClick={() => onChange([...colors, colors[0] ?? "#ffffff"])}
				>
					<Plus /> Add a colour
				</Button>
			) : null}
		</div>
	);
}

function ThemeFields({ doc, set }: { doc: Design; set: SetDoc }) {
	const t = doc.theme;
	const put = (p: Partial<DesignTheme>, key: string) =>
		set({ ...doc, theme: { ...t, ...p } }, `theme:${key}`);
	const readable =
		contrast(t.text, t.bg) >= 4.5 && contrast(t.text, t.panel) >= 4.5;
	return (
		<Section title="The page around it">
			<p className="m-0 text-[13px] text-haze">
				Guests answer below the card. These set that part of the page.
			</p>
			<Row>
				<ColorField
					label="Page"
					value={t.bg}
					onChange={(bg) => put({ bg }, "bg")}
				/>
				<ColorField
					label="Panels"
					value={t.panel}
					onChange={(panel) => put({ panel }, "panel")}
				/>
			</Row>
			<Row>
				<ColorField
					label="Text"
					value={t.text}
					onChange={(text) => put({ text }, "text")}
				/>
				<ColorField
					label="Yes and buttons"
					value={t.accent}
					onChange={(accent) => put({ accent }, "accent")}
				/>
			</Row>
			<Row>
				<ColorField
					label="Maybe and send"
					value={t.accent2}
					onChange={(accent2) => put({ accent2 }, "accent2")}
				/>
			</Row>
			<Row>
				<FontField
					label="Headings"
					value={t.headingFont}
					onChange={(headingFont) => put({ headingFont }, "hf")}
				/>
				<FontField
					label="Body"
					value={t.bodyFont}
					onChange={(bodyFont) => put({ bodyFont }, "bf")}
				/>
			</Row>
			<div
				className="flex flex-col gap-2 rounded-[14px] p-3"
				style={{
					background: t.bg,
					color: t.text,
					fontFamily: `"rsvpd-${t.bodyFont}"`,
				}}
			>
				<div className="rounded-[10px] p-3" style={{ background: t.panel }}>
					<b style={{ fontFamily: `"rsvpd-${t.headingFont}"` }}>You coming?</b>
					<div className="mt-2 flex gap-1.5 text-[13px]">
						<span
							className="rounded-full px-3 py-1"
							style={{ background: t.accent, color: onColor(t.accent) }}
						>
							Yes!
						</span>
						<span
							className="rounded-full px-3 py-1"
							style={{ background: t.accent2, color: onColor(t.accent2) }}
						>
							Maybe
						</span>
					</div>
				</div>
			</div>
			{readable ? null : (
				<p className="m-0 text-[13px] text-pink-ink">
					The text is hard to read on that page or panel colour.
				</p>
			)}
		</Section>
	);
}
