/**
 * The form pieces the design draws by hand: the Yes!/Maybe/Can't picker, the
 * round +/- stepper, the toggle switch row and a labelled field. Native
 * inputs underneath, so they work with a keyboard and a screen reader.
 */

import { cn } from "@rsvp-site/ui/lib/utils";
import { Minus, Plus } from "lucide-react";
import { type ReactNode, useId } from "react";

export type Answer = "yes" | "maybe" | "no";

const ANSWERS: { value: Answer; label: string }[] = [
	{ value: "yes", label: "Yes!" },
	{ value: "maybe", label: "Maybe" },
	{ value: "no", label: "Can't" },
];

/**
 * Radios dressed as one segmented pill. `pending` marks an answer that came
 * from an email link and is not saved yet: it shows picked, but outlined
 * rather than filled, until the guest presses the button.
 */
export function AnswerPicker({
	value,
	onChange,
	pending = false,
	size = "lg",
	name = "answer",
}: {
	value: Answer | null;
	onChange: (answer: Answer) => void;
	pending?: boolean;
	size?: "lg" | "sm";
	name?: string;
}) {
	return (
		<fieldset className="m-0 flex gap-1 rounded-full border-0 bg-night p-1.5">
			<legend className="sr-only">Are you coming?</legend>
			{ANSWERS.map((a) => (
				<label
					key={a.value}
					className={cn(
						"flex flex-1 cursor-pointer items-center justify-center rounded-full text-center font-bold text-soft transition-[background-color,color,box-shadow] hover:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lime",
						size === "lg"
							? "px-1 py-3.5 text-[16px]"
							: "px-0.5 py-2.5 text-[14px]",
						value === a.value &&
							!pending &&
							(a.value === "yes"
								? "bg-lime text-night shadow-lime hover:text-night"
								: a.value === "maybe"
									? "bg-pink text-night hover:text-night"
									: "bg-ink text-night hover:text-night"),
						value === a.value &&
							pending &&
							"text-ink ring-2 ring-lime ring-inset",
					)}
				>
					<input
						type="radio"
						name={name}
						value={a.value}
						checked={value === a.value}
						onChange={() => onChange(a.value)}
						className="sr-only"
					/>
					{a.label}
				</label>
			))}
		</fieldset>
	);
}

/** "Adults 2 [-] [+]" on a dark tile. */
export function Stepper({
	label,
	value,
	min,
	max,
	onChange,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	onChange: (value: number) => void;
}) {
	const id = useId();
	return (
		<div className="flex items-center justify-between gap-2 rounded-[18px] bg-night px-4 py-3.5">
			<span>
				<span id={id} className="block text-[12px] text-haze">
					{label}
				</span>
				<b className="numeral text-[26px]" aria-live="polite">
					{value}
				</b>
			</span>
			<span className="flex gap-1.5">
				<button
					type="button"
					aria-label={`Fewer ${label.toLowerCase()}`}
					aria-describedby={id}
					disabled={value <= min}
					onClick={() => onChange(Math.max(min, value - 1))}
					className="grid size-9 cursor-pointer place-items-center rounded-full border border-line-strong text-ink transition-colors hover:border-haze disabled:cursor-not-allowed disabled:opacity-40"
				>
					<Minus className="size-4" strokeWidth={2} />
				</button>
				<button
					type="button"
					aria-label={`More ${label.toLowerCase()}`}
					aria-describedby={id}
					disabled={value >= max}
					onClick={() => onChange(Math.min(max, value + 1))}
					className="grid size-9 cursor-pointer place-items-center rounded-full bg-ink text-night transition-colors hover:bg-soft disabled:cursor-not-allowed disabled:opacity-40"
				>
					<Plus className="size-4" strokeWidth={2} />
				</button>
			</span>
		</div>
	);
}

/** The lime toggle switch from "What to ask". A checkbox underneath. */
export function Switch({
	checked,
	onChange,
	label,
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: string;
}) {
	return (
		<label className="relative inline-flex h-7 w-[50px] flex-none cursor-pointer rounded-full has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lime has-[:focus-visible]:outline-offset-2">
			<input
				type="checkbox"
				className="peer sr-only"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				aria-label={label}
			/>
			<span className="absolute inset-0 rounded-full bg-line-strong transition-colors peer-checked:bg-lime" />
			<span className="absolute top-[3px] left-[3px] size-[22px] rounded-full bg-night transition-transform peer-checked:translate-x-[22px]" />
		</label>
	);
}

/** One setting: a title, a line under it, and its control on the right. */
export function SettingRow({
	title,
	hint,
	children,
}: {
	title: string;
	hint?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-line border-t py-3.5">
			<div className="min-w-[200px] flex-1">
				<b className="text-[16px]">{title}</b>
				{hint ? <div className="text-[13px] text-haze">{hint}</div> : null}
			</div>
			{children}
		</div>
	);
}

/** A labelled field: the small grey label over whatever input. */
export function Field({
	label,
	htmlFor,
	children,
	className,
	hint,
}: {
	label: string;
	htmlFor?: string;
	children: ReactNode;
	className?: string;
	hint?: ReactNode;
}) {
	return (
		<div className={cn("flex flex-col gap-1.5", className)}>
			<label htmlFor={htmlFor} className="text-[13px] text-haze">
				{label}
			</label>
			{children}
			{hint ? <span className="text-[13px] text-haze">{hint}</span> : null}
		</div>
	);
}

/** The numbered step header in the editor: a lime disc and a title. */
export function StepHeading({
	n,
	title,
	aside,
}: {
	n: number;
	title: string;
	aside?: ReactNode;
}) {
	return (
		<div className="flex items-center gap-3">
			<span className="grid size-8 flex-none place-items-center rounded-full bg-lime font-bold font-heading text-[14px] text-night">
				{n}
			</span>
			<h2 className="m-0 text-[20px]">{title}</h2>
			{aside ? <span className="ml-auto">{aside}</span> : null}
		</div>
	);
}
