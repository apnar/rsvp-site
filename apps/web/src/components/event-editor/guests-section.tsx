import { cn } from "@rsvp-site/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { AddGuests } from "@/components/add-guests";
import { StepHeading } from "@/components/controls";
import { GuestPicker } from "@/components/guest-picker";
import { Panel } from "@/components/page";
import { PillTabs } from "@/components/pill-tabs";
import { plural } from "@/lib/format";

import type { Loaded } from "./form";
import type { EventDraft } from "./use-event-draft";

/**
 * Step 3: email or paper, and who is on the list. An existing event adds
 * people straight away; a new one holds the pick until the draft is saved.
 */
export function GuestsSection({
	loaded,
	draft,
}: {
	loaded?: Loaded;
	draft: EventDraft;
}) {
	const { form, set } = draft;
	const eventId = loaded?.event.id;
	const status = loaded?.event.status ?? "draft";
	const published = status === "published";
	const guestCount = loaded?.guests.length ?? 0;
	const notInvited = loaded?.notInvited ?? 0;

	// A fresh Set each render would look like a new list to AddGuests every time.
	const onList = useMemo(
		() => new Set(loaded?.guests.map((g) => g.userId)),
		[loaded?.guests],
	);
	return (
		<Panel className="gap-3.5">
			<StepHeading
				n={3}
				title="Who's invited"
				aside={
					eventId ? (
						<span className="text-[14px] text-haze">
							{plural(guestCount, "guest")}
						</span>
					) : null
				}
			/>
			<div className="flex flex-wrap items-center gap-3">
				{/* A disabled fieldset disables its buttons for focus and for
				    screen readers; the choice is fixed once published. */}
				<fieldset
					disabled={status !== "draft"}
					className={cn(
						"m-0 min-w-0 border-0 p-0",
						status !== "draft" && "opacity-60",
					)}
				>
					<PillTabs
						label="How guests are invited"
						value={form.paper ? "paper" : "email"}
						onChange={(v) => {
							if (status === "draft") set("paper", v === "paper");
						}}
						options={[
							{ value: "email", label: "Email" },
							{ value: "paper", label: "Paper" },
						]}
					/>
				</fieldset>
				<span className="min-w-[200px] flex-1 text-[13px] text-haze">
					{form.paper
						? "You print a card for each guest with a QR code that signs them in. No email goes to guests until you start emails from the guest list, so the cards arrive first."
						: "Each guest gets the invitation by email when you send."}
					{status === "draft" ? "" : " Chosen when the event went out."}
				</span>
			</div>
			{eventId ? (
				<>
					<p className="m-0 text-soft">
						{guestCount === 0
							? "Nobody yet."
							: `${plural(guestCount, "guest")} on the list${notInvited > 0 ? `, ${notInvited} not invited yet` : ""}.`}{" "}
						<Link to="/e/$eventId/guests" params={{ eventId }}>
							See the guest list
						</Link>
					</p>
					<AddGuests
						eventId={eventId}
						published={published}
						paper={form.paper}
						onList={onList}
					/>
				</>
			) : (
				<GuestPicker
					value={draft.pick}
					onChange={draft.setPick}
					paper={form.paper}
				/>
			)}
		</Panel>
	);
}
