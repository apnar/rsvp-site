import { NativeSelect } from "@/components/native-select";
import type { Print } from "@/lib/cards-pdf";

export function PrintSelect({
	value,
	options,
	onChange,
}: {
	value: Print;
	options: { value: Print; label: string }[];
	onChange: (value: Print) => void;
}) {
	return (
		<>
			<label htmlFor="paper-size" className="sr-only">
				Paper size
			</label>
			<NativeSelect
				id="paper-size"
				value={value}
				onChange={(ev) =>
					onChange(
						options.find((o) => o.value === ev.target.value)?.value ?? value,
					)
				}
				className="min-h-11 px-4"
			>
				{options.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</NativeSelect>
		</>
	);
}
