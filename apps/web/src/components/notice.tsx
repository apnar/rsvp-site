import type { ReactNode } from "react";

/** The pink box for something the reader should see before anything else. */
export function Notice({ children }: { children: ReactNode }) {
	return (
		<p className="m-0 rounded-[18px] border border-pink bg-pink/14 px-4 py-3 text-[14px] text-ink">
			{children}
		</p>
	);
}
