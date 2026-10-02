import type { RsvpAnswer } from "@/lib/rsvp";
import { ANSWERS } from "@/lib/rsvp";

/**
 * In, maybe, out.
 *
 * Native radios, visually hidden, styled through `has-[:checked]:`. Arrow-key
 * navigation, roving focus and "In, radio button, 1 of 3, selected" all come
 * free, and a `<fieldset disabled>` covers all three while a mutation is in
 * flight. The old cards used `aria-pressed`, which is a boolean and cannot say
 * "maybe" at all.
 *
 * `pending` is for the confirm page, where a pick is not yet an answer: the
 * checked cell goes pale instead of solid steel, so the one solid-steel thing
 * on that page is the button that actually records it. The dashboard writes
 * on pick, so there the solid cell *is* the record and stays that way.
 */

const BIG: Record<RsvpAnswer, string> = {
	in: "I'm in",
	maybe: "Maybe",
	out: "I'm out",
};

const SMALL: Record<RsvpAnswer, string> = {
	in: "In",
	maybe: "Mby",
	out: "Out",
};

export function ResponsePicker({
	name,
	value,
	onPick,
	disabled,
	size = "large",
	legend,
	pending = false,
}: {
	/** Radio group name. Must be unique on the page. */
	name: string;
	value: RsvpAnswer | null;
	onPick: (answer: RsvpAnswer) => void;
	disabled?: boolean;
	size?: "large" | "small";
	legend: string;
	/** The pick is provisional; something else records it. */
	pending?: boolean;
}) {
	const large = size === "large";
	const checked = pending
		? "has-[:checked]:bg-steel-100 has-[:checked]:text-steel-900 has-[:checked]:shadow-[inset_0_0_0_2px_var(--color-steel)]"
		: "has-[:checked]:bg-steel has-[:checked]:text-ground";
	return (
		<fieldset
			disabled={disabled}
			className={
				large
					? "m-0 min-w-0 border-0 p-0 disabled:opacity-60"
					: "m-0 min-w-0 border-0 p-0"
			}
		>
			<legend className={large ? "kicker mb-2 text-steel-700" : "sr-only"}>
				{legend}
			</legend>
			<div
				className={
					large
						? "grid grid-cols-3 border border-divider"
						: "grid grid-cols-3 border-current/25 border-t"
				}
			>
				{ANSWERS.map((answer) => (
					<label
						key={answer}
						className={
							large
								? `cursor-pointer border-divider border-l py-3 text-center font-heading font-semibold text-sm uppercase tracking-[0.02em] first:border-l-0 hover:bg-ink/5 ${checked} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-steel has-[:focus-visible]:outline-offset-[-2px]`
								: "relative cursor-pointer border-current/25 border-l py-1.5 text-center font-semibold text-[11px] uppercase tracking-[0.08em] opacity-55 first:border-l-0 has-[:checked]:opacity-100 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-steel has-[:focus-visible]:outline-offset-[-2px] has-[:checked]:after:absolute has-[:checked]:after:inset-x-2 has-[:checked]:after:bottom-[3px] has-[:checked]:after:h-px has-[:checked]:after:bg-current"
						}
					>
						<input
							type="radio"
							className="sr-only"
							name={name}
							value={answer}
							checked={value === answer}
							onChange={() => onPick(answer)}
						/>
						{large ? BIG[answer] : SMALL[answer]}
					</label>
				))}
			</div>
		</fieldset>
	);
}
