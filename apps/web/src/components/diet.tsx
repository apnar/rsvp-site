import { DIETS, type DietId, dietLabel } from "@rsvp-site/db/diets";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { cn } from "@rsvp-site/ui/lib/utils";
import {
	Leaf,
	type LucideIcon,
	MilkOff,
	NutOff,
	ShrimpOff,
	Vegan,
	WheatOff,
} from "lucide-react";

import { Tag } from "@/components/tag";
import { type DietValue, dietSummary } from "@/lib/diet-value";

const DIET_ICONS: Record<DietId, LucideIcon> = {
	vegetarian: Leaf,
	vegan: Vegan,
	gluten_free: WheatOff,
	dairy_free: MilkOff,
	nuts: NutOff,
	shellfish: ShrimpOff,
};

/**
 * One preset's icon, named for screen readers and on hover. `decorative`
 * when its label is printed beside it, so it isn't read out twice.
 */
export function DietIcon({
	id,
	className,
	decorative,
}: {
	id: DietId;
	className?: string;
	decorative?: boolean;
}) {
	const Icon = DIET_ICONS[id];
	const label = dietLabel(id);
	if (decorative) {
		return (
			<Icon
				aria-hidden
				strokeWidth={1.75}
				className={cn("size-4", className)}
			/>
		);
	}
	return (
		<span title={label} className="inline-flex">
			<Icon
				aria-hidden
				strokeWidth={1.75}
				className={cn("size-4", className)}
			/>
			<span className="sr-only">{label}</span>
		</span>
	);
}

/** The icons for a person's ticked presets, in `DIETS` order. */
export function DietIcons({
	diets,
	className,
	decorative,
}: {
	diets: readonly DietId[];
	className?: string;
	/** When `dietSummary` is printed beside them. */
	decorative?: boolean;
}) {
	if (diets.length === 0) return null;
	return (
		<span className={cn("inline-flex items-center gap-1", className)}>
			{diets.map((id) => (
				<DietIcon key={id} id={id} decorative={decorative} />
			))}
		</span>
	);
}

/**
 * The presets as pill checkboxes, and a note for anything else. Controlled;
 * `idPrefix` keeps the ids apart when several people's are on one screen.
 */
export function DietFields({
	value,
	onChange,
	idPrefix,
	disabled,
}: {
	value: DietValue;
	onChange: (value: DietValue) => void;
	idPrefix: string;
	disabled?: boolean;
}) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap gap-2">
				{DIETS.map((d) => {
					const on = value.diets.includes(d.id);
					return (
						<label
							key={d.id}
							className={cn(
								"flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[14px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lime",
								on
									? "border-pink bg-pink/14 font-bold"
									: "border-line hover:border-line-strong",
								disabled && "cursor-not-allowed opacity-50",
							)}
						>
							<input
								type="checkbox"
								className="sr-only"
								checked={on}
								disabled={disabled}
								onChange={(ev) =>
									onChange({
										...value,
										diets: ev.target.checked
											? [...value.diets, d.id]
											: value.diets.filter((id) => id !== d.id),
									})
								}
							/>
							<DietIcon
								id={d.id}
								decorative
								className={on ? "text-pink-ink" : ""}
							/>
							{d.label}
						</label>
					);
				})}
			</div>
			<label
				htmlFor={`${idPrefix}-diet-note`}
				className="flex flex-col gap-1.5 text-[13px] text-haze"
			>
				Other, or more detail
				<Input
					id={`${idPrefix}-diet-note`}
					value={value.note}
					maxLength={500}
					disabled={disabled}
					placeholder="Severity, other allergies, anything the hosts should know"
					onChange={(ev) => onChange({ ...value, note: ev.target.value })}
				/>
			</label>
		</div>
	);
}

/** A person's name, with a "kid" chip when they are a child. */
export function PersonLabel({ name, child }: { name: string; child: boolean }) {
	return (
		<span className="font-bold text-[15px]">
			{name}
			{child ? <Tag>kid</Tag> : null}
		</span>
	);
}

/**
 * One person's diet as a line: who, the icons and summary of what they
 * eat, and a Change button (left out when `onChange` is, as while their
 * boxes are open). `quiet` is the smaller, dimmer summary the account page
 * uses; the default is the after-answer panel's.
 */
export function DietSummaryRow({
	name,
	child,
	value,
	onChange,
	quiet = false,
}: {
	name: string;
	child: boolean;
	value: DietValue;
	onChange?: () => void;
	quiet?: boolean;
}) {
	return (
		<div className="flex items-center justify-between gap-2">
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<PersonLabel name={name} child={child} />
				<span
					className={cn(
						"flex flex-wrap items-center gap-1.5",
						quiet ? "text-[13px] text-haze" : "text-[14px] text-soft",
					)}
				>
					<DietIcons
						diets={value.diets}
						decorative
						className={quiet ? undefined : "text-pink-ink"}
					/>
					{dietSummary(value)}
				</span>
			</span>
			{onChange ? (
				<Button type="button" variant="ghost" size="sm" onClick={onChange}>
					Change
				</Button>
			) : null}
		</div>
	);
}
