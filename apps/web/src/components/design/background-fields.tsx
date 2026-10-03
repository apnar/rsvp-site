import {
	type Background,
	BOUNDS,
	type Design,
	type Stop,
} from "@rsvp-site/design/schema";
import { Button } from "@rsvp-site/ui/components/button";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useDesigner } from "./designer-context";
import { switchBackground } from "./editor-state";
import {
	Check,
	ColorField,
	pct,
	Row,
	Section,
	SelectField,
	Slider,
} from "./fields";
import { CropFields } from "./image-fields";
import { ImagePicker } from "./image-picker";

const BG_KINDS = [
	{ value: "solid", label: "Colour" },
	{ value: "linear", label: "Fade" },
	{ value: "radial", label: "Glow" },
	{ value: "image", label: "Photo" },
	{ value: "pattern", label: "Pattern" },
] as const;

export function BackgroundFields({ doc }: { doc: Design }) {
	const { set, tray } = useDesigner();
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
										min={BOUNDS.tint.min}
										max={BOUNDS.tint.max}
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
						current={bg.kind === "image" ? bg.ref : undefined}
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
						min={BOUNDS.angle.min}
						max={BOUNDS.angle.max}
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
							min={BOUNDS.unit.min}
							max={BOUNDS.unit.max}
							step={0.01}
							format={pct}
							onChange={(cx) => put({ ...bg, cx }, "cx")}
						/>
						<Slider
							label="Down"
							value={bg.cy}
							min={BOUNDS.unit.min}
							max={BOUNDS.unit.max}
							step={0.01}
							format={pct}
							onChange={(cy) => put({ ...bg, cy }, "cy")}
						/>
					</Row>
					<Slider
						label="Reach"
						value={bg.r}
						min={BOUNDS.radialRadius.min}
						max={BOUNDS.radialRadius.max}
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
							min={BOUNDS.patternScale.min}
							max={BOUNDS.patternScale.max}
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
								min={BOUNDS.patternAngle.min}
								max={BOUNDS.patternAngle.max}
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
						min={BOUNDS.unit.min}
						max={BOUNDS.unit.max}
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
