import { slotsLeftFor } from "@rsvp-site/api/headcount";
import { cn } from "@rsvp-site/ui/lib/utils";

import type { Invite } from "./types";

/** "Potluck: claim one": a checkbox per item, with slots left beside it. */
export function PotluckClaims({
	items,
	claims,
	onChange,
}: {
	items: Invite["potluck"];
	claims: string[];
	onChange: (claims: string[]) => void;
}) {
	return (
		<fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
			<legend className="mb-2 p-0 text-[13px] text-haze">
				Potluck: claim one
			</legend>
			{items.map((item) => {
				const mine = claims.includes(item.id);
				const left = slotsLeftFor(item, { saved: item.mine, ticked: mine });
				const full = !mine && left === 0;
				return (
					<label
						key={item.id}
						className={cn(
							"flex cursor-pointer items-center justify-between gap-3 rounded-[14px] border px-4 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lime",
							mine
								? "border-pink bg-pink/14"
								: "border-line hover:border-line-strong",
							full && "cursor-not-allowed opacity-50",
						)}
					>
						<input
							type="checkbox"
							className="sr-only"
							checked={mine}
							disabled={full}
							onChange={(ev) =>
								onChange(
									ev.target.checked
										? [...claims, item.id]
										: claims.filter((id) => id !== item.id),
								)
							}
						/>
						<span className={mine ? "font-bold" : ""}>{item.label}</span>
						<span
							className={cn(
								"text-[13px]",
								mine ? "text-pink-ink" : "text-haze",
							)}
						>
							{mine
								? "Yours"
								: full
									? "Taken"
									: `${left} of ${item.quantity} left`}
						</span>
					</label>
				);
			})}
		</fieldset>
	);
}
