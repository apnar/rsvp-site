import { useEffect, useState } from "react";

import type { Print } from "@/lib/cards-pdf";
import { type CardFormat, layoutsFor, PAPER_SIZES } from "@/lib/paper-sizes";

export function printOptions(format: CardFormat | null): {
	value: Print;
	label: string;
}[] {
	return format ? layoutsFor(format) : PAPER_SIZES;
}

/**
 * How the cards go onto paper, remembered per browser (it is the host's
 * printer): a paper size for the classic card, a sheet layout for a
 * designed one, per card format.
 */
export function usePrint(
	format: CardFormat | null,
): [Print, (value: Print) => void] {
	const key = format ? `print-layout-${format}` : "paper-size";
	const fallback: Print = printOptions(format)[0]?.value ?? "card";
	const [value, setValue] = useState<Print>(fallback);
	useEffect(() => {
		try {
			const saved = localStorage.getItem(key);
			const known = printOptions(format).find((o) => o.value === saved);
			setValue(known ? known.value : fallback);
		} catch {
			// Storage may be blocked; the default is fine.
		}
	}, [key, format, fallback]);
	return [
		value,
		(next) => {
			setValue(next);
			try {
				localStorage.setItem(key, next);
			} catch {
				// Not remembered, then.
			}
		},
	];
}
