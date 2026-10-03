import { BOUNDS, type ImageElement } from "@rsvp-site/design/schema";
import { useDesigner } from "./designer-context";
import {
	Check,
	ColorField,
	NumberField,
	pct,
	Row,
	Section,
	Segmented,
	Slider,
} from "./fields";
import { ImagePicker } from "./image-picker";

export function ImageFields({
	el,
	patch,
}: {
	el: ImageElement;
	patch: (p: Partial<ImageElement>, key: string) => void;
}) {
	const { tray } = useDesigner();
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
					min={BOUNDS.imageRadius.min}
					max={BOUNDS.imageRadius.max}
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
						min={BOUNDS.borderWidth.min}
						max={BOUNDS.borderWidth.max}
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
export function CropFields({
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
				min={BOUNDS.zoom.min}
				max={BOUNDS.zoom.max}
				step={0.05}
				format={(v) => `${v.toFixed(2)}×`}
				onChange={(zoom) => onChange({ zoom })}
			/>
			<Row>
				<Slider
					label="Across"
					value={value.fx}
					min={BOUNDS.unit.min}
					max={BOUNDS.unit.max}
					step={0.01}
					format={pct}
					onChange={(fx) => onChange({ fx })}
				/>
				<Slider
					label="Up and down"
					value={value.fy}
					min={BOUNDS.unit.min}
					max={BOUNDS.unit.max}
					step={0.01}
					format={pct}
					onChange={(fy) => onChange({ fy })}
				/>
			</Row>
		</>
	);
}
