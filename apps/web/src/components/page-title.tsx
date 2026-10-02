/** Two-line condensed display heading; the second line reads in the accent. */
export default function PageTitle({
	line1,
	line2,
	size = "default",
}: {
	line1: string;
	line2: string;
	size?: "default" | "hero";
}) {
	const sizeClass =
		size === "hero"
			? "text-[clamp(48px,7vw,96px)]"
			: "text-[clamp(40px,6vw,80px)]";
	return (
		<h1
			className={`-ml-[0.05em] font-heading font-semibold uppercase leading-[1.02] tracking-[0.01em] ${sizeClass}`}
		>
			<span className="block">{line1}</span>
			<span className={size === "hero" ? "block" : "block text-steel-700"}>
				{line2}
			</span>
		</h1>
	);
}
