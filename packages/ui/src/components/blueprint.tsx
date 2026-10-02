import { cn } from "@rsvp-site/ui/lib/utils";
import type * as React from "react";

/** The four "+" registration marks. Place inside any element with the
 *  `blueprint` class (it must be `position: relative`). */
function Corners() {
	return (
		<>
			<i aria-hidden className="corner tl" />
			<i aria-hidden className="corner tr" />
			<i aria-hidden className="corner bl" />
			<i aria-hidden className="corner br" />
		</>
	);
}

/** A hairline-bordered, square-cornered frame with registration marks. */
function Blueprint({
	className,
	children,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="blueprint"
			className={cn("blueprint", className)}
			{...props}
		>
			<Corners />
			{children}
		</div>
	);
}

export { Blueprint, Corners };
