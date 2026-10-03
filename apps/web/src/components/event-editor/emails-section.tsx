import { Input } from "@rsvp-site/ui/components/input";

import { SettingRow, StepHeading, Switch } from "@/components/controls";
import { Panel } from "@/components/page";
import { PillTabs } from "@/components/pill-tabs";

import type { Loaded } from "./form";
import { ShareLink } from "./share-link";
import type { EventDraft } from "./use-event-draft";

/** Step 6: reminders, host alerts, guest invites and the share link. */
export function EmailsSection({
	loaded,
	draft,
}: {
	loaded?: Loaded;
	draft: EventDraft;
}) {
	const { form, set } = draft;
	return (
		<Panel className="gap-0">
			<div className="mb-2.5">
				<StepHeading n={6} title="Emails and sharing" />
			</div>
			<SettingRow
				title="Day-before reminder"
				hint="To yeses and maybes, at 10 AM"
			>
				<Switch
					label="Day-before reminder"
					checked={form.remindDayBefore}
					onChange={(v) => set("remindDayBefore", v)}
				/>
			</SettingRow>
			<SettingRow
				title="Tell guests about changes"
				hint="When the date, time or place moves, or if you cancel"
			>
				<Switch
					label="Tell guests about changes"
					checked={form.notifyChanges}
					onChange={(v) => set("notifyChanges", v)}
				/>
			</SettingRow>
			<SettingRow
				title="Reply alerts for hosts"
				hint="How you hear about RSVPs"
			>
				<PillTabs
					label="Reply alerts"
					value={form.hostAlerts}
					onChange={(v) => set("hostAlerts", v)}
					options={[
						{ value: "off", label: "Off" },
						{ value: "each", label: "Each" },
						{ value: "daily", label: "Daily" },
					]}
				/>
			</SettingRow>
			<SettingRow
				title="Guests can invite others"
				hint="Only people you invite, never the people they add or share-link joiners"
			>
				<span className="flex items-center gap-3">
					{form.guestInvites ? (
						<span className="flex items-center gap-2 text-[14px] text-soft">
							up to
							<Input
								type="number"
								min={1}
								max={20}
								aria-label="Most people each guest can invite"
								value={form.guestInviteLimit}
								onChange={(ev) =>
									set(
										"guestInviteLimit",
										Math.max(1, Math.min(20, Number(ev.target.value) || 1)),
									)
								}
								className="min-h-10 w-20 rounded-full py-2 text-center"
							/>
							each
						</span>
					) : null}
					<Switch
						label="Guests can invite others"
						checked={form.guestInvites}
						onChange={(v) => set("guestInvites", v)}
					/>
				</span>
			</SettingRow>
			<SettingRow
				title="Share link"
				hint="Anyone with the link can ask to join by email."
			>
				<Switch
					label="Share link"
					checked={form.shareEnabled}
					onChange={(v) => set("shareEnabled", v)}
				/>
			</SettingRow>
			{form.shareEnabled && loaded ? (
				<ShareLink eventId={loaded.event.id} url={loaded.shareUrl} />
			) : null}
		</Panel>
	);
}
