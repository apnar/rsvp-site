/**
 * How many people a party or a total is, in words. Pure, and the one
 * place it is said, so the guest list, the emails and the texts agree.
 * A child a relative answered for is stored as 0 adults and 1 kid, so
 * "0 adults" is never printed beside kids.
 */

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * One party: "2 adults, 1 kid", "1 kid". At least one person, as `tally`
 * counts an answer: a party of nobody reads as one adult.
 */
export function partyLabel(
	p: { adults: number; kids: number },
	joiner = ", ",
): string {
	const adults = Math.max(0, p.adults);
	const kids = Math.max(0, p.kids);
	if (adults + kids < 1) return count(1, "adult");
	return [
		...(adults > 0 ? [count(adults, "adult")] : []),
		...(kids > 0 ? [count(kids, "kid")] : []),
	].join(joiner);
}

/**
 * A total, where nobody is a real answer: both counts always, except
 * "0 adults" beside kids. "2 adults · 0 kids", "1 kid", "0 adults · 0 kids".
 */
export function totalsLabel(
	t: { adults: number; kids: number },
	joiner = " · ",
): string {
	return [
		...(t.adults > 0 || t.kids === 0 ? [count(t.adults, "adult")] : []),
		count(t.kids, "kid"),
	].join(joiner);
}
