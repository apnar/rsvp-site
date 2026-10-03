import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { Textarea } from "@rsvp-site/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { ImagePlus, Trash2 } from "lucide-react";
import { useRef } from "react";

import { Field, StepHeading, Switch } from "@/components/controls";
import { Panel } from "@/components/page";
import { refreshCard } from "@/lib/design-card";
import { shrinkCover } from "@/lib/shrink-image";
import { client } from "@/utils/orpc";

import type { Loaded } from "./form";
import type { EventDraft } from "./use-event-draft";
import type { SaveEvent } from "./use-save-event";

/** Step 1: the cover, the designed-card switch, and the event's facts. */
export function BasicsSection({
	loaded,
	draft,
	save,
}: {
	loaded?: Loaded;
	draft: EventDraft;
	save: SaveEvent;
}) {
	const { form, set, coverShown } = draft;
	const eventId = loaded?.event.id;
	const fileRef = useRef<HTMLInputElement>(null);

	const toggleDesign = useMutation({
		mutationFn: async (on: boolean) => {
			if (!eventId) return;
			await client.designs.setOn({ eventId, on });
			if (on) await refreshCard(eventId, true).catch(() => {});
		},
	});

	return (
		<Panel>
			<StepHeading n={1} title="The basics" />
			<div className="relative aspect-[16/7] overflow-hidden rounded-[20px] bg-night">
				{coverShown ? (
					<img src={coverShown} alt="" className="size-full object-cover" />
				) : (
					<button
						type="button"
						onClick={() => fileRef.current?.click()}
						className="flex size-full cursor-pointer flex-col items-center justify-center gap-2 border-0 bg-transparent text-haze hover:text-ink"
					>
						<ImagePlus className="size-8" strokeWidth={1.5} />
						<span>Add a cover photo</span>
					</button>
				)}
				{coverShown ? (
					<div className="absolute right-3 bottom-3 flex gap-2">
						<Button
							variant="light"
							size="sm"
							onClick={() => fileRef.current?.click()}
						>
							Change
						</Button>
						<Button
							variant="outline"
							size="icon-sm"
							aria-label="Remove the cover photo"
							className="bg-night/70"
							onClick={() => {
								draft.setCoverFile(null);
								draft.setDropCover(true);
							}}
						>
							<Trash2 />
						</Button>
					</div>
				) : null}
				<input
					ref={fileRef}
					type="file"
					accept="image/jpeg,image/png,image/webp"
					className="sr-only"
					tabIndex={-1}
					onChange={async (ev) => {
						const file = ev.target.files?.[0];
						ev.target.value = "";
						if (!file) return;
						draft.setCoverFile(await shrinkCover(file));
						draft.setDropCover(false);
					}}
				/>
			</div>
			<div className="flex flex-wrap items-center gap-3 rounded-[18px] border border-line-strong px-4 py-3">
				<div className="min-w-[200px] flex-1">
					<b className="text-[16px]">Design your own invitation</b>
					<div className="text-[13px] text-haze">
						{loaded?.event.designOn
							? "Guests see your designed card, on screen and on paper."
							: "Fonts, colours, pictures, placed wherever you like."}
					</div>
				</div>
				{loaded?.hasDesign ? (
					<Switch
						checked={loaded.event.designOn}
						onChange={(on) => toggleDesign.mutate(on)}
						disabled={toggleDesign.isPending}
						label="Guests see the designed card"
					/>
				) : null}
				<Button
					variant="outline"
					size="sm"
					disabled={save.busy}
					onClick={() => save.run("design")}
				>
					{loaded?.hasDesign ? "Open the designer" : "Design it"}
				</Button>
			</div>
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
