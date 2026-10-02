/** Numbered section label with the hairline rule beneath it. */
export default function SectionKicker({
	children,
	className = "mb-8",
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<>
			<span className="kicker mb-3 block text-steel-700 leading-3">
				{children}
			</span>
			<hr className={`h-px border-0 bg-divider ${className}`} />
		</>
	);
}
