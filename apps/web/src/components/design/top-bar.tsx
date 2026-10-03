import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

/** The designer's header: back to the event, its title, then the page's own controls. */
export function TopBar({
	eventId,
	title,
	children,
}: {
	eventId: string;
	title: string;
	children?: ReactNode;
}) {
	return (
		<header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-line border-b bg-night/95 px-[clamp(12px,3vw,24px)] py-2.5 backdrop-blur">
			<Link
				to="/e/$eventId/edit"
				params={{ eventId }}
				className="flex items-center gap-1.5 font-bold text-[14px] no-underline"
			>
				<ArrowLeft className="size-4" /> Event
			</Link>
			<span className="mr-auto min-w-0 truncate pl-2 font-heading text-[15px]">
				{title}
			</span>
			{children}
		</header>
	);
}
