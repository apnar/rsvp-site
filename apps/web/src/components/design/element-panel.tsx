import { BOUNDS, type Design, type Element } from "@rsvp-site/design/schema";
import { Button } from "@rsvp-site/ui/components/button";
import { Trash2 } from "lucide-react";
import type { RefObject } from "react";
import { useDesigner } from "./designer-context";
import { patchEl, removeEls } from "./editor-state";
import {
	Check,
	ColorField,
	NumberField,
	OptionalColor,
	pct,
	Row,
	Section,
	SelectField,
	Slider,
} from "./fields";
import { ImageFields } from "./image-fields";
import { StickerGrid } from "./image-picker";
import { TextFields } from "./text-fields";

/** One selected element: its own settings, then placement. */
export function ElementPanel({
	el,
	doc,
	textRef,
}: {
	el: Element;
	doc: Design;
	textRef: RefObject<HTMLTextAreaElement | null>;
}) {
	const { set, paper } = useDesigner();
	const patch = (p: Partial<Element>, key: string) =>
		set(patchEl(doc, el.id, p), `${el.id}:${key}`);
	return (
		<div className="flex flex-col gap-4">
			{el.type === "text" ? (
				<TextFields el={el} patch={patch} textRef={textRef} />
			) : null}
			{el.type === "image" ? <ImageFields el={el} patch={patch} /> : null}
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
								min={BOUNDS.strokeWidth.min}
								max={BOUNDS.strokeWidth.max}
								onChange={(strokeWidth) => patch({ strokeWidth }, "sw")}
							/>
						) : null}
						{el.type === "rect" ? (
							<NumberField
								label="Corner radius"
								value={el.radius}
								min={BOUNDS.rectRadius.min}
								max={BOUNDS.rectRadius.max}
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
							min={BOUNDS.lineWidth.min}
							max={BOUNDS.lineWidth.max}
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
						min={BOUNDS.size.min}
						onChange={(w) => patch(el.type === "qr" ? { w, h: w } : { w }, "w")}
					/>
					<NumberField
						label="Height"
						value={el.h}
						min={BOUNDS.size.min}
						onChange={(h) => patch(el.type === "qr" ? { w: h, h } : { h }, "h")}
					/>
				</Row>
				<Row>
					<NumberField
						label="Turn (°)"
						value={el.rot}
						min={BOUNDS.rot.min}
						max={BOUNDS.rot.max}
						onChange={(rot) => patch({ rot }, "rot")}
					/>
					<Slider
						label="Opacity"
						value={el.opacity}
						min={BOUNDS.unit.min}
						max={BOUNDS.unit.max}
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
