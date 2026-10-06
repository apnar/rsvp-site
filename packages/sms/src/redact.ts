/** Enough of a number to tell lines apart in the logs, not to dial it. */
export function redactPhone(phone: string): string {
	return `...${phone.slice(-4)}`;
}
