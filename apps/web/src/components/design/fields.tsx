/**
 * Compact inputs for the designer's inspector. The editor's own fields are
 * sized for a form you fill once; these sit four to a row.
 */
import { FONT_IDS, FONTS, type FontId, family } from "@rsvp-site/design/fonts";
import { cn } from "@rsvp-site/ui/lib/utils";
import { type ReactNode, useEffect, useId, useState } from "react";

const box =
	"min-h-9 w-full min-w-0 rounded-[10px] border border-line-strong bg-night px-2.5 py-1.5 text-[14px] text-ink outline-none hover:border-haze focus-visible:border-lime";

/** A titled group of fields in the inspector. */
export function Section({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-3 border-line border-t pt-4 first:border-t-0 first:pt-0">
			<h3 className="kicker m-0 text-haze">{title}</h3>
			{children}
		</section>
	);
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;

export function Row({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("grid grid-cols-2 gap-2.5", className)}>{children}</div>
	);
}

function Labelled({
	label,
	id,
	children,
	className,
}: {
	label: string;
	id: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex min-w-0 flex-col gap-1", className)}>
			<label htmlFor={id} className="text-[12px] text-haze">
				{label}
			</label>
			{children}
		</div>
	);
}

/**
 * A number that commits as you type but keeps your half-typed text
 * ("1." or "-") until it parses.
 */
export function NumberField({
	label,
	value,
	onChange,
	min,
	max,
	step = 1,
	className,
}: {
	label: string;
	value: number;
	onChange: (n: number) => void;
	min?: number;
	max?: number;
	step?: number;
	className?: string;
}) {
	const id = useId();
	const shown = String(Math.round(value * 100) / 100);
	const [text, setText] = useState(shown);
	useEffect(() => setText(shown), [shown]);
	return (
		<Labelled label={label} id={id} className={className}>
			<input
				id={id}
				type="number"
				inputMode="decimal"
				className={box}
				value={text}
				min={min}
				max={max}
				step={step}
				onChange={(e) => {
					setText(e.target.value);
					const n = Number(e.target.value);
					if (e.target.value !== "" && Number.isFinite(n)) {
						onChange(Math.min(max ?? n, Math.max(min ?? n, n)));
					}
				}}
				onBlur={() => setText(shown)}
			/>
		</Labelled>
	);
}

/** A colour swatch and its hex, either of which can be edited. */
export function ColorField({
	label,
	value,
	onChange,
	className,
}: {
	label: string;
	value: string;
	onChange: (hex: string) => void;
	className?: string;
}) {
	const id = useId();
	const [text, setText] = useState(value);
	useEffect(() => setText(value), [value]);
	return (
		<Labelled label={label} id={id} className={className}>
			<span className="flex items-center gap-1.5">
				<input
					type="color"
					aria-label={`${label} swatch`}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="size-9 flex-none cursor-pointer rounded-[10px] border border-line-strong bg-night p-1"
				/>
				<input
					id={id}
					className={cn(box, "font-mono text-[13px]")}
					value={text}
					spellCheck={false}
					onChange={(e) => {
						const v = e.target.value.trim();
						setText(v);
						const hex = v.startsWith("#") ? v : `#${v}`;
						if (/^#[0-9a-fA-F]{6}$/.test(hex)) onChange(hex.toLowerCase());
					}}
					onBlur={() => setText(value)}
				/>
			</span>
		</Labelled>
	);
}

/** A colour that may be "none". */
export function OptionalColor({
	label,
	value,
	fallback,
	onChange,
}: {
	label: string;
	value: string | null;
	fallback: string;
	onChange: (hex: string | null) => void;
}) {
	return (
		<div className="flex min-w-0 flex-col gap-1">
			{value ? (
				<ColorField label={label} value={value} onChange={onChange} />
			) : (
				<span className="text-[12px] text-haze">{label}</span>
			)}
			<button
				type="button"
				className="cursor-pointer self-start border-0 bg-transparent p-0 text-[12px] text-lime-ink hover:text-lime-soft"
				onClick={() => onChange(value ? null : fallback)}
			>
				{value ? "None" : `Add ${label.toLowerCase()}`}
			</button>
		</div>
	);
}

export function SelectField<T extends string>({
	label,
	value,
	options,
	onChange,
	className,
}: {
	label: string;
	value: T;
	options: readonly { value: T; label: string }[];
	onChange: (v: T) => void;
	className?: string;
}) {
	const id = useId();
	return (
		<Labelled label={label} id={id} className={className}>
			<select
				id={id}
				className={cn(box, "cursor-pointer")}
				value={value}
				onChange={(e) => onChange(e.target.value as T)}
			>
				{options.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</select>
		</Labelled>
	);
}

/** Every curated font, each shown in itself. */
export function FontField({
	label,
	value,
	onChange,
	className,
}: {
	label: string;
	value: FontId;
	onChange: (f: FontId) => void;
	className?: string;
}) {
	const id = useId();
	return (
		<Labelled label={label} id={id} className={className}>
			<select
				id={id}
				className={cn(box, "cursor-pointer")}
				style={{ fontFamily: `"${family(value)}"` }}
				value={value}
				onChange={(e) => onChange(e.target.value as FontId)}
			>
				{FONT_IDS.map((f) => (
					<option key={f} value={f} style={{ fontFamily: `"${family(f)}"` }}>
						{FONTS[f].label}
					</option>
				))}
			</select>
		</Labelled>
	);
}

/** A row of pill buttons, one of which is on. */
export function Segmented<T extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	options: readonly { value: T; label: ReactNode; title?: string }[];
	onChange: (v: T) => void;
}) {
	return (
		<div className="flex min-w-0 flex-col gap-1">
			<span className="text-[12px] text-haze">{label}</span>
			<div className="flex rounded-full bg-night p-0.5">
				{options.map((o) => (
					<button
						key={o.value}
						type="button"
						aria-pressed={o.value === value}
						title={o.title}
						onClick={() => onChange(o.value)}
						className={cn(
							"min-h-8 flex-1 cursor-pointer rounded-full border-0 bg-transparent px-2 text-[13px] text-soft",
							o.value === value && "bg-ink text-night",
						)}
					>
						{o.label}
					</button>
				))}
			</div>
		</div>
	);
}

export function Check({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<label className="flex cursor-pointer items-center gap-2 text-[14px]">
			<input
				type="checkbox"
				className="size-4 accent-lime"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
			/>
			{label}
		</label>
	);
}

export function Slider({
	label,
	value,
	min,
	max,
	step,
	onChange,
	format,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (v: number) => void;
	format?: (v: number) => string;
}) {
	const id = useId();
	return (
		<Labelled label={`${label}: ${format ? format(value) : value}`} id={id}>
			<input
				id={id}
				type="range"
				className="w-full accent-lime"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
			/>
		</Labelled>
	);
}
