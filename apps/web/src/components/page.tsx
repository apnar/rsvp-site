import { cn } from "@rsvp-site/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * The design's column: 1180px, with a gutter that shrinks on a phone. The
 * header, footer, hero and every page body hang off it, so they line up.
 */
export function Container({
	children,
	className,
	as: Tag = "div",
	id,
}: {
	children: ReactNode;
	className?: string;
	as?: "div" | "section" | "header" | "footer";
	id?: string;
}) {
	return (
		<Tag
			id={id}
			className={cn(
				"mx-auto w-full max-w-[1180px] px-[clamp(16px,4vw,40px)]",
				className,
			)}
		>
			{children}
		</Tag>
	);
}

/** A page's column: a Container that stacks its sections with room between. */
export function Page({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<Container
			className={cn(
				"flex flex-col gap-[clamp(28px,5vw,56px)] pt-[clamp(12px,2.5vw,28px)] pb-20",
				className,
			)}
		>
			{children}
		</Container>
	);
}

/** Kicker over a big Unbounded heading, with optional actions to the right. */
export function PageHead({
	kicker,
	title,
	actions,
	size = "lg",
}: {
	kicker?: ReactNode;
	title: ReactNode;
	actions?: ReactNode;
	size?: "lg" | "md";
}) {
	return (
		<section className="flex flex-wrap items-end gap-x-7 gap-y-5">
			<div className="flex min-w-0 flex-[1_1_420px] flex-col gap-3">
				{kicker ? <span className="kicker text-lime-ink">{kicker}</span> : null}
				<h1
					className={cn(
						"m-0 font-black tracking-[-0.04em]",
						// Leading after the size: tailwind-merge drops a leading class
						// that comes before a font-size one.
						size === "lg"
							? "text-[clamp(34px,5.6vw,64px)] leading-[0.98]"
							: "text-[clamp(30px,4.8vw,56px)] leading-none",
					)}
				>
					{title}
				</h1>
			</div>
			{actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
		</section>
	);
}

/** A rounded panel, the design's basic container. */
export function Panel({
	title,
	children,
	className,
	as: Tag = "section",
	onSubmit,
}: {
	/** The heading a panel opens with. */
	title?: ReactNode;
	children: ReactNode;
	className?: string;
	as?: "section" | "div" | "article" | "form";
	/** Only meaningful with `as="form"`. */
	onSubmit?: (event: { preventDefault(): void }) => void;
}) {
	return (
		<Tag
			onSubmit={onSubmit}
			className={cn(
				"flex flex-col gap-4 rounded-[26px] bg-panel p-[clamp(18px,3vw,28px)]",
				className,
			)}
		>
			{title ? <h2 className="m-0 text-[20px]">{title}</h2> : null}
			{children}
		</Tag>
	);
}
