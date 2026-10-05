// Carriers bill and split by segment, and one curly quote turns a 160
// character GSM-7 text into a 70 character UCS-2 one. Hosts type in word
// processors, so the common typographic characters are folded to ASCII first.
const REPLACEMENTS: Record<string, string> = {
	"‘": "'",
	"’": "'",
	"‚": "'",
	"‛": "'",
	"“": '"',
	"”": '"',
	"„": '"',
	"–": "-",
	"—": "-",
	"−": "-",
	"…": "...",
	" ": " ",
	" ": " ",
	" ": " ",
	" ": " ",
	" ": " ",
	"•": "-",
	"·": "-",
	"​": "",
	"﻿": "",
};

export function toGsm(text: string): string {
	let out = "";
	for (const ch of text) out += REPLACEMENTS[ch] ?? ch;
	return out;
}

const BASIC = new Set(
	[
		"@£$¥èéùìòÇ\nØø\rÅå",
		"Δ_ΦΓΛΩΠΨΣΘΞÆæßÉ",
		" !\"#¤%&'()*+,-./0123456789:;<=>?",
		"¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§",
		"¿abcdefghijklmnopqrstuvwxyzäöñüà",
	].join(""),
);
const EXTENDED = new Set("^{}\\[~]|€\f");

export function segments(text: string): {
	encoding: "GSM-7" | "UCS-2";
	parts: number;
} {
	let units = 0;
	let gsm = true;
	for (const ch of text) {
		if (BASIC.has(ch)) units += 1;
		else if (EXTENDED.has(ch)) units += 2;
		else {
			gsm = false;
			break;
		}
	}
	if (gsm) {
		return {
			encoding: "GSM-7",
			parts: units <= 160 ? 1 : Math.ceil(units / 153),
		};
	}
	// UCS-2 counts UTF-16 code units, so an emoji is two.
	const length = text.length;
	return {
		encoding: "UCS-2",
		parts: length <= 70 ? 1 : Math.ceil(length / 67),
	};
}
