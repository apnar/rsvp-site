import { cn } from "@rsvp-site/ui/lib/utils";

/**
 * The segmented filter: a dark pill holding options, the chosen one white.
 * Plain buttons with aria-pressed, so it works as a filter, not navigation.
 */
export function PillTabs<T extends string>({
	value,
	options,
	onChange,
	label,
	className,
}: {
	value: T;
	options: { value: T; label: string; count?: number }[];
	onChange: (value: T) => void;
	label: string;
	className?: string;
}) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset would bring a border and legend the design does not have.
		<div
			role="group"
			aria-label={label}
			className={cn(
				"flex flex-wrap gap-0.5 rounded-full bg-panel p-[5px] font-bold text-[14px]",
				className,
			)}
		>
			{options.map((o) => (
				<button
					key={o.value}
					type="button"
					aria-pressed={o.value === value}
					onClick={() => onChange(o.value)}
					className="cursor-pointer rounded-full px-3.5 py-2 text-soft transition-colors hover:text-ink aria-pressed:bg-ink aria-pressed:text-night"
				>
					{o.label}
					{o.count === undefined ? null : ` ${o.count}`}
				</button>
			))}
		</div>
	);
}
