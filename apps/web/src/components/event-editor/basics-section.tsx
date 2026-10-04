import { Input } from "@rsvp-site/ui/components/input";
import { Textarea } from "@rsvp-site/ui/components/textarea";

import { Field, StepHeading } from "@/components/controls";
import { Panel } from "@/components/page";

import type { Loaded } from "./form";
import { LookPicker } from "./look-picker";
import type { EventDraft } from "./use-event-draft";
import type { SaveEvent } from "./use-save-event";

/** Step 1: how the invitation looks, then the event's facts. */
export function BasicsSection({
	loaded,
	draft,
	save,
}: {
	loaded?: Loaded;
	draft: EventDraft;
	save: SaveEvent;
}) {
	const { form, set } = draft;

	return (
		<Panel>
			<StepHeading n={1} title="The basics" />
			<LookPicker loaded={loaded} draft={draft} save={save} />
			<Field label="Event name" htmlFor="title">
				<Input
					id="title"
					value={form.title}
					maxLength={120}
					placeholder="Ava turns 9: backyard movie night"
					className="font-bold font-heading text-[18px]"
					onChange={(ev) => set("title", ev.target.value)}
				/>
			</Field>
			<Field label="Hosted by" htmlFor="hostLine">
				<Input
					id="hostLine"
					value={form.hostLine}
					maxLength={120}
					placeholder="The Lukens"
					onChange={(ev) => set("hostLine", ev.target.value)}
				/>
			</Field>
			<div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
				<Field label="Date" htmlFor="date">
					<Input
						id="date"
						type="date"
						value={form.date}
						onChange={(ev) => set("date", ev.target.value)}
					/>
				</Field>
				<Field label="Starts" htmlFor="start">
					<Input
						id="start"
						type="time"
						value={form.startTime}
						onChange={(ev) => set("startTime", ev.target.value)}
					/>
				</Field>
				<Field label="Ends" htmlFor="end">
					<Input
						id="end"
						type="time"
						value={form.endTime}
						onChange={(ev) => set("endTime", ev.target.value)}
					/>
				</Field>
			</div>
			<Field label="Where" htmlFor="location">
				<Input
					id="location"
					value={form.location}
					maxLength={200}
					placeholder="112 Lakeview Ave, Rockville MD"
					onChange={(ev) => set("location", ev.target.value)}
				/>
			</Field>
			<Field
				label="The details"
				htmlFor="details"
				hint="On the invitation everywhere: the invite page, the emails and printed cards."
			>
				<Textarea
					id="details"
					value={form.details}
					maxLength={5000}
					className="min-h-24"
					placeholder="What's the plan? What should people bring or wear?"
					onChange={(ev) => set("details", ev.target.value)}
				/>
			</Field>
			<Field
				label="More details, on the invite page only"
				htmlFor="extraDetails"
				hint="Never emailed or printed: only guests who open their invitation see these."
			>
				<Textarea
					id="extraDetails"
					value={form.extraDetails}
					maxLength={5000}
					className="min-h-20"
					placeholder="Parking, the gate code, the playlist link..."
					onChange={(ev) => set("extraDetails", ev.target.value)}
				/>
			</Field>
		</Panel>
	);
}
