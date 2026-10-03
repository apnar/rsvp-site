import { UnsavedBar } from "@/components/design/unsaved-bar";
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

export function EventEditor({ loaded }: { loaded?: Loaded }) {
	const draft = useEventDraft(loaded);
	const save = useSaveEvent(loaded, draft);
	const { blocker, busy, saveAndLeave } = save;

	return (
		<div className="flex flex-wrap items-start gap-[clamp(24px,4vw,44px)]">
			<UnsavedBar
				blocker={blocker}
				saving={busy}
				onSaveAndLeave={saveAndLeave}
				className="basis-full rounded-[18px] border"
			/>
			<div className="flex min-w-0 flex-[999_1_520px] flex-col gap-[18px]">
				<BasicsSection loaded={loaded} draft={draft} save={save} />
				<HostsSection
					loaded={loaded}
					pending={draft.cohostEmails}
					onPendingChange={draft.setCohostEmails}
				/>
				<GuestsSection loaded={loaded} draft={draft} />
				<QuestionsSection draft={draft} />
				<PotluckSection draft={draft} />
				<EmailsSection loaded={loaded} draft={draft} />
				<ActionsBar loaded={loaded} draft={draft} save={save} />
			</div>
			<GuestPreview loaded={loaded} draft={draft} />
		</div>
	);
}
