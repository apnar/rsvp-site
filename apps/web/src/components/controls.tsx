/**
 * The form pieces the design draws by hand: the yes / maybe / no picker, the
 * round +/- stepper, the toggle switch row and a labelled field. Native
 * inputs underneath, so they work with a keyboard and a screen reader.
 */

import { type AnswerSet, offered } from "@rsvp-site/api/answer-words";
import type { Answer } from "@rsvp-site/api/headcount";
import { cn } from "@rsvp-site/ui/lib/utils";
import { Minus, Plus } from "lucide-react";
import {
	cloneElement,
	isValidElement,
	type ReactElement,
	type ReactNode,
	useId,
} from "react";

/**
 * Radios dressed as one segmented pill. `pending` marks an answer that came
 * from an email link and is not saved yet: it shows picked, but outlined
 * rather than filled, until the guest presses the button.
 *
 * The event's words label the answers. With maybe off it offers two, but
 * keeps maybe for somebody whose `saved` answer it already is.
 */
export function AnswerPicker({
	answers,
	saved = null,
	value,
	onChange,
	pending = false,
	size = "lg",
	name = "answer",
	legend = "Are you coming?",
}: {
	answers: AnswerSet;
	saved?: Answer | null;
	value: Answer | null;
	onChange: (answer: Answer) => void;
	pending?: boolean;
	size?: "lg" | "sm";
	name?: string;
	/** For a screen reader; say whose answer it is when it is not the viewer's. */
	legend?: string;
}) {
	return (
		<fieldset className="m-0 flex gap-1 rounded-full border-0 bg-night p-1.5">
			<legend className="sr-only">{legend}</legend>
			{offered(answers, saved).map((a) => (
				<label
					key={a}
					className={cn(
						"flex flex-1 cursor-pointer items-center justify-center rounded-full text-center font-bold text-soft transition-[background-color,color,box-shadow] hover:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lime",
						size === "lg"
							? "px-1 py-3.5 text-[16px]"
							: "px-0.5 py-2.5 text-[14px]",
						value === a &&
							!pending &&
							(a === "yes"
								? "bg-lime text-on-lime shadow-lime hover:text-on-lime"
								: a === "maybe"
									? "bg-pink text-on-pink hover:text-on-pink"
									: "bg-ink text-on-ink hover:text-on-ink"),
						value === a && pending && "text-ink ring-2 ring-lime ring-inset",
					)}
				>
					<input
						type="radio"
						name={name}
						value={a}
						checked={value === a}
						onChange={() => onChange(a)}
						className="sr-only"
					/>
					{answers.words[a].pick}
				</label>
			))}
		</fieldset>
	);
}

/**
 * A choice between a few options, as radios in one pill: the picked one
 * filled lime, like the main action. It is named by a hidden legend, or by
 * a title the page shows (`labelledBy`).
 */
export function Segmented<T extends string>({
	legend,
	name,
	options,
	value,
	onChange,
	labelledBy,
	disabled = false,
}: {
	legend?: string;
	labelledBy?: string;
	name: string;
	options: { value: T; label: ReactNode }[];
	value: T;
	onChange: (value: T) => void;
	disabled?: boolean;
}) {
	return (
		<fieldset
			disabled={disabled}
			aria-labelledby={labelledBy}
			className="m-0 flex gap-1 rounded-full border-0 bg-night p-1.5 disabled:opacity-70"
		>
			{legend ? <legend className="sr-only">{legend}</legend> : null}
			{options.map((o) => (
				<label
					key={o.value}
					className={cn(
						"flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full px-3 py-2.5 text-center font-bold text-[14px] text-soft transition-[background-color,color] hover:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lime",
						value === o.value &&
							"bg-lime text-on-lime shadow-lime hover:text-on-lime",
					)}
				>
					<input
						type="radio"
						name={name}
						value={o.value}
						checked={value === o.value}
						onChange={() => onChange(o.value)}
						className="sr-only"
					/>
					{o.label}
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
					className="grid size-9 cursor-pointer place-items-center rounded-full bg-ink text-on-ink transition-colors hover:bg-soft disabled:cursor-not-allowed disabled:opacity-40"
				>
					<Plus className="size-4" strokeWidth={2} />
				</button>
			</span>
		</div>
	);
}

/**
 * The lime toggle switch from "What to ask". A checkbox underneath. With
 * `children` those words are the visible caption inside the same label, so
 * pressing them toggles it and they are its accessible name; a bare switch
 * (its words are elsewhere, say in a SettingRow) is named by `label`.
 */
export function Switch({
	checked,
	onChange,
	label,
	disabled = false,
	className,
	children,
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label?: string;
	disabled?: boolean;
	/** For the label, to size and colour the caption. */
	className?: string;
	children?: ReactNode;
}) {
	return (
		<label
			className={cn(
				"inline-flex items-center gap-3",
				disabled ? "cursor-not-allowed" : "cursor-pointer",
				className,
			)}
		>
			<span className="relative inline-flex h-7 w-[50px] flex-none rounded-full has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lime has-[:focus-visible]:outline-offset-2">
				<input
					type="checkbox"
					className="peer sr-only"
					checked={checked}
					disabled={disabled}
					onChange={(e) => onChange(e.target.checked)}
					aria-label={children ? undefined : label}
				/>
				<span className="absolute inset-0 rounded-full bg-line-strong transition-colors peer-checked:bg-lime" />
				<span className="absolute top-[3px] left-[3px] size-[22px] rounded-full bg-night transition-transform peer-checked:translate-x-[22px]" />
			</span>
			{children}
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

/**
 * A labelled field: the small grey label over whatever input. A hint is
 * tied to a lone input child with aria-describedby, so a screen reader
 * reads it with the field rather than as stray text after it.
 */
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
	const hintId = useId();
	return (
		<div className={cn("flex flex-col gap-1.5", className)}>
			<label htmlFor={htmlFor} className="text-[13px] text-haze">
				{label}
			</label>
			{hint && isValidElement(children)
				? cloneElement(
						children as ReactElement<{ "aria-describedby"?: string }>,
						{
							"aria-describedby": hintId,
						},
					)
				: children}
			{hint ? (
				<span id={hintId} className="text-[13px] text-haze">
					{hint}
				</span>
			) : null}
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
			<span className="grid size-8 flex-none place-items-center rounded-full bg-lime font-bold font-heading text-[14px] text-on-lime">
				{n}
			</span>
			<h2 className="m-0 text-[20px]">{title}</h2>
			{aside ? <span className="ml-auto">{aside}</span> : null}
		</div>
	);
}
