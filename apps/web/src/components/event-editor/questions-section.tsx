import { Input } from "@rsvp-site/ui/components/input";

import { SettingRow, StepHeading, Switch } from "@/components/controls";
import { Panel } from "@/components/page";

import { AnswersSetting } from "./answers-setting";
import type { EventDraft } from "./use-event-draft";

/** Step 4: what guests are asked and how, and the RSVP deadline. */
export function QuestionsSection({ draft }: { draft: EventDraft }) {
	const { form, set } = draft;
	return (
		<Panel className="gap-0">
			<div className="mb-2.5">
				<StepHeading n={4} title="What to ask" />
			</div>
			<AnswersSetting draft={draft} />
			<SettingRow
				title="Plus-ones"
				hint={
					form.maxPlusOnes > 0
						? `Up to ${form.maxPlusOnes} per invite`
						: "Just the guest"
				}
			>
				<span className="flex items-center gap-3">
					{form.maxPlusOnes > 0 ? (
						<Input
							type="number"
							min={1}
							max={20}
							aria-label="Most plus-ones per invite"
							value={form.maxPlusOnes}
							onChange={(ev) =>
								set(
									"maxPlusOnes",
									Math.max(1, Math.min(20, Number(ev.target.value) || 1)),
								)
							}
							className="min-h-10 w-20 rounded-full py-2 text-center"
						/>
					) : null}
					<Switch
						label="Plus-ones"
						checked={form.maxPlusOnes > 0}
						onChange={(on) => set("maxPlusOnes", on ? 4 : 0)}
					/>
				</span>
			</SettingRow>
			<SettingRow title="Kids count" hint="Counted separately from adults">
				<Switch
					label="Kids count"
					checked={form.askKids}
					onChange={(v) => set("askKids", v)}
				/>
			</SettingRow>
			<SettingRow title="Dietary notes" hint="Allergies and preferences">
				<Switch
					label="Dietary notes"
					checked={form.askDietary}
					onChange={(v) => set("askDietary", v)}
				/>
			</SettingRow>
			<SettingRow
				title="Note to the host"
				hint="Optional message with each RSVP"
			>
				<Switch
					label="Note to the host"
					checked={form.askNote}
					onChange={(v) => set("askNote", v)}
				/>
			</SettingRow>
			<SettingRow
				title="Show who's coming"
				hint="Guests see the names of yeses and maybes. Counts always show."
			>
				<Switch
					label="Show who's coming"
					checked={form.showGuestNames}
					onChange={(v) => set("showGuestNames", v)}
				/>
			</SettingRow>
			<SettingRow
				title="RSVP deadline"
				hint="Answers stay open until the party starts; this is what you ask for."
			>
				<Input
					type="date"
					aria-label="RSVP deadline"
					value={form.rsvpDeadline}
					onChange={(ev) => set("rsvpDeadline", ev.target.value)}
					className="min-h-10 w-[170px] rounded-full py-2"
				/>
			</SettingRow>
			{form.rsvpDeadline ? (
				<SettingRow
					title="Deadline reminder"
					hint="To people who haven't answered, at 10 AM"
				>
					<span className="flex items-center gap-3">
						{form.remindDeadline ? (
							<span className="flex items-center gap-2 text-[14px] text-soft">
								<Input
									type="number"
									min={0}
									max={30}
									aria-label="Days before the deadline"
									value={form.remindDaysBefore}
									onChange={(ev) =>
										set(
											"remindDaysBefore",
											Math.max(0, Math.min(30, Number(ev.target.value) || 0)),
										)
									}
									className="min-h-10 w-20 rounded-full py-2 text-center"
								/>
								days before
							</span>
						) : null}
						<Switch
							label="Deadline reminder"
							checked={form.remindDeadline}
							onChange={(v) => set("remindDeadline", v)}
						/>
					</span>
				</SettingRow>
			) : null}
		</Panel>
	);
}
