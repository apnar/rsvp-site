import { Button } from "@rsvp-site/ui/components/button";

import { ActionsBar } from "./actions-bar";
import { BasicsSection } from "./basics-section";
import { EmailsSection } from "./emails-section";
import type { Loaded } from "./form";
import { GuestPreview } from "./guest-preview";
import { GuestsSection } from "./guests-section";
import { HostsSection } from "./hosts-section";
import { PotluckSection } from "./potluck-section";
import { QuestionsSection } from "./questions-section";
import { useEventDraft } from "./use-event-draft";
import { useSaveEvent } from "./use-save-event";

export type { EventForm } from "./form";

export function EventEditor({ loaded }: { loaded?: Loaded }) {
	const draft = useEventDraft(loaded);
	const save = useSaveEvent(loaded, draft);
	const { blocker, busy, saveAndLeave } = save;

	return (
		<div className="flex flex-wrap items-start gap-[clamp(24px,4vw,44px)]">
			{blocker.status === "blocked" ? (
				<div className="flex basis-full flex-wrap items-center gap-3 rounded-[18px] border border-pink bg-pink/14 px-4 py-2.5 text-[14px]">
					<span className="mr-auto">You have changes that aren't saved.</span>
					<Button size="sm" variant="ghost" onClick={blocker.proceed}>
						Leave without saving
					</Button>
					<Button size="sm" variant="light" onClick={blocker.reset}>
						Stay
					</Button>
					<Button size="sm" disabled={busy} onClick={saveAndLeave}>
						Save and leave
					</Button>
				</div>
			) : null}
			<div className="flex min-w-0 flex-[999_1_520px] flex-col gap-[18px]">
				<BasicsSection loaded={loaded} draft={draft} save={save} />
				<HostsSection
					loaded={loaded}
					pending={draft.cohostEmails}
					onPendingChange={draft.setCohostEmails}
				/>
				<GuestsSection loaded={loaded} draft={draft} save={save} />
				<QuestionsSection draft={draft} />
				<PotluckSection draft={draft} />
				<EmailsSection loaded={loaded} draft={draft} />
				<ActionsBar loaded={loaded} draft={draft} save={save} />
			</div>
			<GuestPreview loaded={loaded} draft={draft} />
		</div>
	);
}
