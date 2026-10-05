import { DIETS, type DietId, dietLabel } from "@rsvp-site/db/diets";
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

/** A person's diet as the forms hold it. */
export type DietValue = { diets: DietId[]; note: string };

export const NO_DIET: DietValue = { diets: [], note: "" };

export const DIET_ICONS: Record<DietId, LucideIcon> = {
	vegetarian: Leaf,
	vegan: Vegan,
	gluten_free: WheatOff,
	dairy_free: MilkOff,
	nuts: NutOff,
	shellfish: ShrimpOff,
};

export function sameDiet(a: DietValue, b: DietValue): boolean {
	return (
		a.note.trim() === b.note.trim() &&
		a.diets.length === b.diets.length &&
		a.diets.every((id) => b.diets.includes(id))
	);
}

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

/** "Vegetarian · Nut allergy · no cilantro", or that there's nothing. */
export function dietSummary(value: DietValue): string {
	const parts = [...value.diets.map(dietLabel), value.note.trim()].filter(
		Boolean,
	);
	return parts.length > 0 ? parts.join(" · ") : "No restrictions";
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
