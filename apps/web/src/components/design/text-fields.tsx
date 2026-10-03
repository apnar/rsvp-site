import {
	FONTS,
	type FontId,
	type FontInfo,
	hasItalic,
	nearestWeight,
} from "@rsvp-site/design/fonts";
import { PLACEHOLDERS } from "@rsvp-site/design/placeholders";
import { BOUNDS, type TextElement } from "@rsvp-site/design/schema";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import type { RefObject } from "react";
import {
	Check,
	ColorField,
	FontField,
	NumberField,
	Row,
	Section,
	Segmented,
	SelectField,
} from "./fields";

export function TextFields({
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
					maxLength={BOUNDS.text.max}
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
						min={BOUNDS.textSize.min}
						max={BOUNDS.textSize.max}
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
						min={BOUNDS.lineHeight.min}
						max={BOUNDS.lineHeight.max}
						step={0.05}
						onChange={(lineHeight) => patch({ lineHeight }, "lh")}
					/>
					<NumberField
						label="Letter spacing"
						value={el.tracking}
						min={BOUNDS.tracking.min}
						max={BOUNDS.tracking.max}
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
							min={BOUNDS.shadowOffset.min}
							max={BOUNDS.shadowOffset.max}
							onChange={(dx) =>
								el.shadow && patch({ shadow: { ...el.shadow, dx } }, "shadow")
							}
						/>
						<NumberField
							label="Down"
							value={el.shadow.dy}
							min={BOUNDS.shadowOffset.min}
							max={BOUNDS.shadowOffset.max}
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
