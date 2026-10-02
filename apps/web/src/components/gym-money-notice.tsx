import { buttonVariants } from "@rsvp-site/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { describeContribution } from "@/lib/contributions";
import { orpc } from "@/utils/orpc";

/**
 * The standing fact about you with one button, the way the break notice on
 * the RSVP board works. Only while you still owe: paid, excused, or books
 * closed and it is gone. Nothing here writes -- marking paid is the host's job.
 */
export default function GymMoneyNotice() {
	const mine = useQuery(orpc.contributions.mine.queryOptions());
	if (mine.data?.status !== "unpaid") return null;
	return (
		<div className="max-w-[560px] border border-amber-300 bg-amber-50 px-4 py-3">
			<p className="m-0 text-[13px] text-amber-900 leading-5">
				{describeContribution(mine.data)}
			</p>
			<Link
				to="/dashboard"
				className={buttonVariants({
					variant: "outline",
					size: "sm",
					className: "mt-3 no-underline",
				})}
			>
				Your account
			</Link>
		</div>
	);
}
