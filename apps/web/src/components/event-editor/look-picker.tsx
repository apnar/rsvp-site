import { Button } from "@rsvp-site/ui/components/button";
import { useMutation } from "@tanstack/react-query";

import { Segmented } from "@/components/controls";
import { CardSvg } from "@/components/design/card-svg";
import { refreshCard } from "@/lib/design-card";
import { client } from "@/utils/orpc";

import { CoverPicker } from "./cover-picker";
import type { Loaded } from "./form";
import type { EventDraft } from "./use-event-draft";
import type { SaveEvent } from "./use-save-event";

type Look = "photo" | "card";

/**
 * How the invitation looks: a cover photo, or the host's designed card,
 * which replaces the cover everywhere a guest would see it. Only the
 * chosen look's controls show. The cover is kept while the card is on,
 * since switching back shows it again.
 */
export function LookPicker({
	loaded,
	draft,
	save,
}: {
	loaded?: Loaded;
	draft: EventDraft;
	save: SaveEvent;
}) {
	const eventId = loaded?.event.id;
	const hasDesign = loaded?.hasDesign ?? false;

	// Live, like the designer's own switch, not part of the draft: the
	// server checks a paper event's card for its QR code as it turns on.
	const toggleDesign = useMutation({
		mutationFn: async (on: boolean) => {
			if (!eventId) return;
			await client.designs.setOn({ eventId, on });
			if (on) await refreshCard(eventId, true).catch(() => {});
		},
	});

	const look: Look = toggleDesign.isPending
		? toggleDesign.variables
			? "card"
			: "photo"
		: loaded?.event.designOn
			? "card"
			: "photo";

	const choose = (next: Look) => {
		if (next === look) return;
		// With nothing designed yet the choice stays on the photo until the
		// designer's first save turns the card on, so backing out of the
		// designer can't leave an event that shows a card it doesn't have.
		if (next === "card" && !hasDesign) save.run("design");
		else toggleDesign.mutate(next === "card");
	};

	return (
		<div className="flex flex-col gap-3">
			<Segmented
				legend="How the invitation looks"
				name="look"
				value={look}
				onChange={choose}
				disabled={
					toggleDesign.isPending ||
					save.busy ||
					loaded?.event.status === "canceled"
				}
				options={[
					{ value: "photo", label: "Standard design" },
					{ value: "card", label: "Custom design" },
				]}
			/>
			{look === "card" ? (
				<div className="flex flex-wrap items-center gap-4 rounded-[18px] border border-line-strong p-3">
					{loaded?.card ? (
						<CardSvg
							scene={loaded.card}
							className="h-auto max-h-36 w-24 flex-none rounded-[4px] shadow-float"
						/>
					) : null}
					<div className="flex min-w-[200px] flex-1 flex-col items-start gap-2.5">
						<div>
							<b className="text-[16px]">Your designed card</b>
							<div className="text-[13px] text-haze">
								Guests see it on the invite page, in the emails and on paper.
								{draft.coverShown
									? " Your cover photo is kept in case you switch back."
									: null}
							</div>
						</div>
						<Button
							variant="outline"
							size="sm"
							disabled={save.busy}
							onClick={() => save.run("design")}
						>
							Open the designer
						</Button>
					</div>
				</div>
			) : (
				<>
					<CoverPicker draft={draft} />
					{hasDesign ? (
						<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-haze">
							<span>You have a designed card saved, switched off.</span>
							<Button
								variant="ghost"
								size="sm"
								disabled={save.busy}
								onClick={() => save.run("design")}
							>
								Open the designer
							</Button>
						</div>
					) : null}
				</>
			)}
		</div>
	);
}
