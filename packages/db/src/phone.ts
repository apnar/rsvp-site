/**
 * A typed phone number in the one form stored: `+` and digits. Ten digits,
 * or eleven starting with 1, are taken as North American, since that is
 * who this site invites; a number typed with a leading + keeps its own
 * country code. Anything outside 7 to 15 digits (E.164's ceiling) is not a
 * phone number and gives null.
 */
export function normalizePhone(raw: string): string | null {
	const typed = raw.trim();
	const digits = typed.replace(/\D/g, "");
	if (digits.length < 7 || digits.length > 15) return null;
	if (typed.startsWith("+")) return `+${digits}`;
	if (digits.length === 10) return `+1${digits}`;
	if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
	return digits;
}

/** "(301) 555-1212" for a North American number; anything else as stored. */
export function formatPhone(stored: string | null): string {
	if (!stored) return "";
	const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(stored);
	return us ? `(${us[1]}) ${us[2]}-${us[3]}` : stored;
}

/**
 * The stored number when this site can text it, else null. Only US
 * numbers: the Telnyx profile sends nowhere else, and a US area code never
 * starts with 0 or 1.
 */
export function textablePhone(stored: string | null): string | null {
	return stored && /^\+1[2-9]\d{9}$/.test(stored) ? stored : null;
}
