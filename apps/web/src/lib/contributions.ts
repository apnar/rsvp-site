/** Whole dollars with a comma where a four-figure rental earns one. */
export function dollars(n: number): string {
	return `$${Math.round(n)
		.toFixed(0)
		.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export type MyContribution = {
	amount: number;
	instructions: string;
	status: "unpaid" | "paid" | "excused";
};

/** One sentence about where a guest stands, in the voice of the rest of the site. */
export function describeContribution(m: MyContribution): string {
	switch (m.status) {
		case "paid":
			return "Paid. The host has it.";
		case "excused":
			return "Excused this round. The host's call, not yours.";
		default:
			return `You owe ${dollars(m.amount)} toward the costs. ${m.instructions} The host marks it paid once it lands.`;
	}
}
