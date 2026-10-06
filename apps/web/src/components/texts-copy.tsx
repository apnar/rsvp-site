/**
 * The texting consent wording, in one place: carriers read what people saw
 * when they said yes, so each sentence must be the same wherever it shows.
 */

/** The host's tick that the numbers they pasted expect a text. */
export function TextsOkCheckbox({
	checked,
	onChange,
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex cursor-pointer items-start gap-3 text-[14px] text-soft">
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				className="mt-1 size-4 accent-lime"
			/>
			The people whose numbers I added expect a text from me about this.
		</label>
	);
}

/** The rates / STOP / HELP disclosure, to sit inside a caption. */
export function TextsDisclosure() {
	return (
		<>
			Message and data rates may apply. Reply STOP to stop, HELP for help. See
			our <a href="/terms">terms</a> and <a href="/privacy">privacy policy</a>.
		</>
	);
}
