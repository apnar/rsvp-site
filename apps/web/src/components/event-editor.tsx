import { formatDate, formatTimeRange } from "@rsvp-site/api/time";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { Textarea } from "@rsvp-site/ui/components/textarea";
import { cn } from "@rsvp-site/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { Outputs } from "@/lib/api-types";
import { refreshCard } from "@/lib/design-card";
import { coverSrc, plural } from "@/lib/format";
import { client, orpc } from "@/utils/orpc";

import { AddGuests, BookPicker, GroupChips } from "./add-guests";
import {
	AnswerPicker,
	Field,
	SettingRow,
	StepHeading,
	Switch,
} from "./controls";
import { Cover } from "./cover";
import { CardSvg } from "./design/card-svg";
import { PillTabs } from "./pill-tabs";

type Loaded = Outputs["events"]["get"];
type HostAlerts = "off" | "each" | "daily";

export type EventForm = {
	title: string;
	hostLine: string;
	date: string;
	startTime: string;
	endTime: string;
	location: string;
	details: string;
	extraDetails: string;
	rsvpDeadline: string;
	maxPlusOnes: number;
	askKids: boolean;
	askDietary: boolean;
	askNote: boolean;
	potluckEnabled: boolean;
	showGuestNames: boolean;
	shareEnabled: boolean;
	paper: boolean;
	guestInvites: boolean;
	guestInviteLimit: number;
	remindDeadline: boolean;
	remindDaysBefore: number;
	remindDayBefore: boolean;
	notifyChanges: boolean;
	hostAlerts: HostAlerts;
};

type Item = { key: string; id?: string; label: string; quantity: number };

const BLANK: EventForm = {
	title: "",
	hostLine: "",
	date: "",
	startTime: "18:00",
	endTime: "",
	location: "",
	details: "",
	extraDetails: "",
	rsvpDeadline: "",
	maxPlusOnes: 4,
	askKids: true,
	askDietary: true,
	askNote: true,
	potluckEnabled: false,
	showGuestNames: true,
	shareEnabled: false,
	paper: false,
	guestInvites: false,
	guestInviteLimit: 3,
	remindDeadline: true,
	remindDaysBefore: 3,
	remindDayBefore: true,
	notifyChanges: true,
	hostAlerts: "daily",
};

function formOf(loaded: Loaded): EventForm {
	const e = loaded.event;
	return {
		title: e.title,
		hostLine: e.hostLine,
		date: e.date ?? "",
		startTime: e.startTime ?? "",
		endTime: e.endTime ?? "",
		location: e.location,
		details: e.details,
		extraDetails: e.extraDetails,
		rsvpDeadline: e.rsvpDeadline ?? "",
		maxPlusOnes: e.maxPlusOnes,
		askKids: e.askKids,
		askDietary: e.askDietary,
		askNote: e.askNote,
		potluckEnabled: e.potluckEnabled,
		showGuestNames: e.showGuestNames,
		shareEnabled: e.shareEnabled,
		paper: e.paper,
		guestInvites: e.guestInvites,
		guestInviteLimit: e.guestInviteLimit,
		remindDeadline: e.remindDeadline,
		remindDaysBefore: e.remindDaysBefore,
		remindDayBefore: e.remindDayBefore,
		notifyChanges: e.notifyChanges,
		hostAlerts: e.hostAlerts,
	};
}

/** The form as the API wants it: empty strings become nulls. */
function fieldsOf(f: EventForm) {
	return {
		...f,
		title: f.title.trim(),
		date: f.date || null,
		startTime: f.startTime || null,
		endTime: f.endTime || null,
		rsvpDeadline: f.rsvpDeadline || null,
	};
}

let itemKey = 0;
const nextKey = () => `new-${++itemKey}`;

/**
 * Scale a photo down in the browser before it goes up: a phone camera's
 * 12-megapixel original would be slow to send and slower to load in every
 * inbox. Falls back to the original if the browser cannot decode it.
 */
async function shrink(file: File, max = 1600): Promise<File> {
	try {
		const bitmap = await createImageBitmap(file);
		const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement("canvas");
		canvas.width = Math.round(bitmap.width * scale);
		canvas.height = Math.round(bitmap.height * scale);
		canvas
			.getContext("2d")
			?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, "image/jpeg", 0.85),
		);
		return blob ? new File([blob], "cover.jpg", { type: "image/jpeg" }) : file;
	} catch {
		return file;
	}
}

export function EventEditor({ loaded }: { loaded?: Loaded }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const eventId = loaded?.event.id;
	const status = loaded?.event.status ?? "draft";
	const published = status === "published";

	const initial = useMemo(() => (loaded ? formOf(loaded) : BLANK), [loaded]);
	const [form, setForm] = useState<EventForm>(initial);
	const [items, setItems] = useState<Item[]>(() =>
		(loaded?.potluck ?? []).map((p) => ({
			key: p.id,
			id: p.id,
			label: p.label,
			quantity: p.quantity,
		})),
	);
	const [coverFile, setCoverFile] = useState<File | null>(null);
	const [coverPreview, setCoverPreview] = useState<string | null>(null);
	const [dropCover, setDropCover] = useState(false);
	// New events only: who to put on the list when the draft is first saved.
	const [emails, setEmails] = useState("");
	const [groupIds, setGroupIds] = useState<string[]>([]);
	const [pickedIds, setPickedIds] = useState<string[]>([]);
	// New events only: co-hosts to add once the draft exists.
	const [cohostEmails, setCohostEmails] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);

	useEffect(() => setForm(initial), [initial]);
	useEffect(() => {
		if (!coverFile) return;
		const url = URL.createObjectURL(coverFile);
		setCoverPreview(url);
		return () => URL.revokeObjectURL(url);
	}, [coverFile]);

	const set = <K extends keyof EventForm>(key: K, value: EventForm[K]) =>
		setForm((f) => ({ ...f, [key]: value }));

	const itemsChanged = useMemo(() => {
		const before = (loaded?.potluck ?? [])
			.map((p) => `${p.id}:${p.label}:${p.quantity}`)
			.join("|");
		const after = items
			.filter((i) => i.label.trim())
			.map((i) => `${i.id ?? ""}:${i.label.trim()}:${i.quantity}`)
			.join("|");
		return before !== after;
	}, [items, loaded]);

	const moved =
		published &&
		form.notifyChanges &&
		(form.date !== initial.date ||
			form.startTime !== initial.startTime ||
			form.endTime !== initial.endTime ||
			form.location.trim() !== initial.location);
	const notInvited = loaded?.notInvited ?? 0;
	const newPeople =
		emails.trim().length > 0 || groupIds.length > 0 || pickedIds.length > 0;

	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: orpc.events.key() });

	/** Save everything; returns the event id. */
	const save = async (): Promise<string> => {
		const fields = fieldsOf(form);
		if (!fields.title) throw new Error("Give it a name.");
		let id = eventId;
		let notified = 0;
		if (!id) {
			id = (await client.events.create(fields)).id;
		} else {
			notified = (await client.events.update({ eventId: id, fields })).notified;
		}
		if (coverFile) {
			await client.events.uploadCover({ eventId: id, file: coverFile });
		} else if (dropCover && loaded?.event.coverKey) {
			await client.events.removeCover({ eventId: id });
		}
		if (itemsChanged || (!eventId && items.length > 0)) {
			await client.events.setPotluck({
				eventId: id,
				items: items
					.filter((i) => i.label.trim())
					.map((i) => ({
						id: i.id,
						label: i.label.trim(),
						quantity: i.quantity,
					})),
			});
		}
		if (!eventId) {
			// The draft exists now; co-hosts can be added to it. One that is not
			// a host on the site is reported and the rest still go on.
			for (const email of cohostEmails) {
				try {
					await client.events.addCohost({ eventId: id, email });
				} catch (error) {
					toast.error(`${email}: ${(error as Error).message}`);
				}
			}
		}
		if (!eventId && newPeople) {
			await client.guests.add({
				eventId: id,
				emails,
				groupIds,
				userIds: pickedIds,
			});
		}
		if (loaded?.hasDesign) {
			// The card picture bakes in the date, place and title.
			await refreshCard(id, true).catch(() => {});
		}
		if (notified > 0)
			toast.success(`Told ${plural(notified, "guest")} about the change.`);
		setCoverFile(null);
		setDropCover(false);
		return id;
	};

	const toggleDesign = async (on: boolean) => {
		if (!eventId) return;
		try {
			await client.designs.setOn({ eventId, on });
			if (on) await refreshCard(eventId, true).catch(() => {});
			await refresh();
		} catch (error) {
			toast.error((error as Error).message);
		}
	};

	const run = async (after: "stay" | "send" | "preview" | "design") => {
		setBusy(true);
		try {
			const id = await save();
			if (after === "send") {
				const r = await client.events.send({ eventId: id });
				toast.success(
					r.held
						? "Published. Download the cards from the guest list; no emails go out until you start them."
						: r.sent > 0
							? `Sent ${plural(r.sent, "invite")}.${r.dryRun ? " (Logged, not sent: no mail key.)" : ""}`
							: "Published. Nobody new to invite.",
				);
				await refresh();
				navigate({ to: "/e/$eventId/guests", params: { eventId: id } });
				return;
			}
			await refresh();
			if (after === "design") {
				navigate({ to: "/e/$eventId/design", params: { eventId: id } });
				return;
			}
			if (after === "preview") {
				navigate({ to: "/e/$eventId", params: { eventId: id } });
				return;
			}
			if (!eventId) {
				toast.success("Draft saved.");
				navigate({ to: "/e/$eventId/edit", params: { eventId: id } });
			} else {
				toast.success("Saved.");
			}
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setBusy(false);
		}
	};

	const coverShown =
		coverPreview ??
		(dropCover
			? null
			: loaded?.event.coverKey
				? coverSrc(loaded.event.coverKey)
				: null);
	const guestCount = loaded?.guests.length ?? 0;
	const sendCount = eventId ? notInvited : 0;

	return (
		<div className="flex flex-wrap items-start gap-[clamp(24px,4vw,44px)]">
			<div className="flex min-w-0 flex-[999_1_520px] flex-col gap-[18px]">
				<section className="flex flex-col gap-4 rounded-[26px] bg-panel p-[clamp(18px,3vw,28px)]">
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
										setCoverFile(null);
										setCoverPreview(null);
										setDropCover(true);
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
								setCoverFile(await shrink(file));
								setDropCover(false);
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
								onChange={toggleDesign}
								label="Guests see the designed card"
							/>
						) : null}
						<Button
							variant="outline"
							size="sm"
							disabled={busy}
							onClick={() => run("design")}
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
				</section>

				<HostsSection
					loaded={loaded}
					pending={cohostEmails}
					onPendingChange={setCohostEmails}
				/>

				<section className="flex flex-col gap-3.5 rounded-[26px] bg-panel p-[clamp(18px,3vw,28px)]">
					<StepHeading
						n={3}
						title="Who's invited"
						aside={
							eventId ? (
								<span className="text-[14px] text-haze">
									{plural(guestCount, "household")}
								</span>
							) : null
						}
					/>
					<div className="flex flex-wrap items-center gap-3">
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
							className={
								status === "draft" ? "" : "pointer-events-none opacity-60"
							}
						/>
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
									: `${plural(guestCount, "household")} on the list${notInvited > 0 ? `, ${notInvited} not invited yet` : ""}.`}{" "}
								<Link to="/e/$eventId/guests" params={{ eventId }}>
									See the guest list
								</Link>
							</p>
							<AddGuests
								eventId={eventId}
								published={published}
								paper={form.paper}
								onList={new Set(loaded?.guests.map((g) => g.userId))}
								onAdded={() => refresh()}
							/>
						</>
					) : (
						<>
							<BookPicker selected={pickedIds} onChange={setPickedIds} />
							<GroupChips
								selected={groupIds}
								onToggle={(id) =>
									setGroupIds((ids) =>
										ids.includes(id)
											? ids.filter((x) => x !== id)
											: [...ids, id],
									)
								}
							/>
							<label htmlFor="new-emails" className="sr-only">
								Email addresses
							</label>
							<Textarea
								id="new-emails"
								value={emails}
								placeholder={
									form.paper
										? "One per line: an email, or just a name for a card-only guest"
										: "Add emails, separated by commas or new lines"
								}
								onChange={(ev) => setEmails(ev.target.value)}
							/>
							<span className="text-[13px] text-haze">
								{form.paper
									? "Each guest answers with the QR code on their card. Nobody is emailed until you start emails."
									: "Guests sign in with their email to RSVP, so every answer has a name on it. Nobody is emailed until you send."}
							</span>
						</>
					)}
				</section>

				<section className="flex flex-col rounded-[26px] bg-panel p-[clamp(18px,3vw,28px)]">
					<div className="mb-2.5">
						<StepHeading n={4} title="What to ask" />
					</div>
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
													Math.max(
														0,
														Math.min(30, Number(ev.target.value) || 0),
													),
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
				</section>

				<section className="flex flex-col gap-3 rounded-[26px] bg-panel p-[clamp(18px,3vw,28px)]">
					<StepHeading
						n={5}
						title="Potluck"
						aside={
							<Switch
								label="Potluck"
								checked={form.potluckEnabled}
								onChange={(v) => set("potluckEnabled", v)}
							/>
						}
					/>
					{form.potluckEnabled ? (
						<>
							{items.map((item, i) => (
								<div key={item.key} className="flex items-center gap-2">
									<Input
										aria-label={`Item ${i + 1}`}
										value={item.label}
										maxLength={80}
										placeholder="Drinks, dessert, bags of ice..."
										onChange={(ev) =>
											setItems((all) =>
												all.map((x) =>
													x.key === item.key
														? { ...x, label: ev.target.value }
														: x,
												),
											)
										}
										className="min-w-0 flex-1"
									/>
									<Input
										type="number"
										min={1}
										max={99}
										aria-label={`How many of item ${i + 1}`}
										value={item.quantity}
										onChange={(ev) =>
											setItems((all) =>
												all.map((x) =>
													x.key === item.key
														? {
																...x,
																quantity: Math.max(
																	1,
																	Math.min(99, Number(ev.target.value) || 1),
																),
															}
														: x,
												),
											)
										}
										className="w-16 flex-none px-0 text-center"
									/>
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={`Remove ${item.label || "item"}`}
										onClick={() =>
											setItems((all) => all.filter((x) => x.key !== item.key))
										}
									>
										×
									</Button>
								</div>
							))}
							<Button
								variant="link"
								className="self-start font-bold"
								onClick={() =>
									setItems((all) => [
										...all,
										{ key: nextKey(), label: "", quantity: 1 },
									])
								}
							>
								+ Add an item
							</Button>
						</>
					) : (
						<span className="text-[14px] text-haze">
							Turn it on to let guests claim what they'll bring.
						</span>
					)}
				</section>

				<section className="flex flex-col rounded-[26px] bg-panel p-[clamp(18px,3vw,28px)]">
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
				</section>

				<div className="flex flex-wrap justify-end gap-2.5">
					{status === "draft" && eventId ? (
						<DeleteDraft eventId={eventId} />
					) : null}
					{published && eventId ? (
						<CancelEvent
							eventId={eventId}
							stillComing={loaded?.stillComing ?? 0}
						/>
					) : null}
					<Button variant="outline" disabled={busy} onClick={() => run("stay")}>
						{status === "draft"
							? "Save draft"
							: moved
								? `Save and tell ${plural(loaded?.stillComing ?? 0, "guest")}`
								: "Save"}
					</Button>
					<Button
						variant="secondary"
						disabled={busy}
						onClick={() => run("preview")}
					>
						Preview as guest
					</Button>
					{status === "canceled" ? null : status === "draft" ||
						sendCount > 0 ||
						newPeople ? (
						<Button
							variant="send"
							size="lg"
							disabled={busy || !form.date}
							onClick={() => run("send")}
						>
							{form.paper
								? "Publish"
								: status === "draft"
									? sendCount > 0
										? `Send ${plural(sendCount, "invite")}`
										: "Send invites"
									: `Send ${plural(sendCount, "invite")}`}
						</Button>
					) : null}
				</div>
				{status === "draft" && !form.date ? (
					<span className="self-end text-[13px] text-haze">
						Pick a date to send.
					</span>
				) : null}
			</div>

			<aside className="sticky top-5 flex min-w-0 max-w-full flex-[1_1_300px] flex-col gap-2.5">
				<span className="kicker text-haze">Guest preview</span>
				{loaded?.card ? (
					<CardSvg
						scene={loaded.card}
						className="h-auto w-full rounded-[6px] shadow-float"
					/>
				) : (
					<div className="overflow-hidden rounded-[26px] border border-line bg-panel">
						<div className="relative aspect-[4/5]">
							{coverShown ? (
								<img
									src={coverShown}
									alt=""
									className="size-full object-cover"
								/>
							) : (
								<Cover coverKey={null} />
							)}
							<div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,var(--color-night)_100%)]" />
							<div className="pointer-events-none absolute right-[18px] bottom-[18px] left-[18px] flex flex-col gap-2.5">
								<span className="self-start rounded-full bg-lime px-3 py-1 font-bold text-[11px] text-on-lime uppercase tracking-[0.08em]">
									You're on the list
								</span>
								<span className="font-black font-heading text-[26px] leading-none tracking-[-0.04em]">
									{form.title || "Your party"}
								</span>
								<span className="text-[14px] text-soft">
									{form.date ? formatDate(form.date) : "Date to come"}
									{form.startTime ? (
										<>
											{" · "}
											<span className="text-lime-ink">
												{formatTimeRange(form.startTime, form.endTime || null)}
											</span>
										</>
									) : null}
								</span>
							</div>
						</div>
						<div className="pointer-events-none p-3.5" aria-hidden>
							<AnswerPicker
								value="yes"
								onChange={() => {}}
								size="sm"
								name="preview"
							/>
						</div>
					</div>
				)}
			</aside>
		</div>
	);
}

function ShareLink({ eventId, url }: { eventId: string; url: string }) {
	const queryClient = useQueryClient();
	const reset = useMutation(
		orpc.events.resetShareLink.mutationOptions({
			onSuccess: () => {
				toast.success("New link made. The old one stopped working.");
				queryClient.invalidateQueries({ queryKey: orpc.events.key() });
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);
	return (
		<div className="flex flex-wrap items-center gap-2 pb-3.5">
			<Input
				readOnly
				value={url}
				aria-label="Share link"
				className="min-w-0 flex-[1_1_240px] rounded-full"
				onFocus={(ev) => ev.target.select()}
			/>
			<Button
				variant="light"
				size="sm"
				onClick={async () => {
					await navigator.clipboard.writeText(url);
					toast.success("Copied.");
				}}
			>
				Copy
			</Button>
			<Button
				variant="ghost"
				size="sm"
				disabled={reset.isPending}
				onClick={() => reset.mutate({ eventId })}
			>
				New link
			</Button>
			<span className="basis-full text-[13px] text-haze">
				The link works once the invites have gone out. Save to switch it on or
				off.
			</span>
		</div>
	);
}

/**
 * Who runs the event. Co-hosts can edit it, see the whole guest list and
 * send for it; they must be hosts on the site, which is an admin's call, so
 * the suggestions are the hosts in the caller's address book. On a new
 * event the addresses wait in `pending` until the draft is saved.
 */
function HostsSection({
	loaded,
	pending,
	onPendingChange,
}: {
	loaded?: Loaded;
	pending: string[];
	onPendingChange: (emails: string[]) => void;
}) {
	const queryClient = useQueryClient();
	const book = useQuery(orpc.contacts.book.queryOptions());
	const [email, setEmail] = useState("");
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: orpc.events.key() });
	const add = useMutation(
		orpc.events.addCohost.mutationOptions({
			onSuccess: () => {
				setEmail("");
				refresh();
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);
	const remove = useMutation(
		orpc.events.removeCohost.mutationOptions({
			onSuccess: () => refresh(),
			onError: (error: Error) => toast.error(error.message),
		}),
	);
	const hostEmails = new Set(loaded?.hosts.map((h) => h.email) ?? []);
	const suggestions = (book.data?.people ?? []).filter(
		(p) =>
			p.canHost &&
			p.email &&
			!hostEmails.has(p.email) &&
			!pending.includes(p.email),
	);
	const addEmail = (value: string) => {
		const clean = value.trim().toLowerCase();
		if (!clean) return;
		if (loaded) add.mutate({ eventId: loaded.event.id, email: clean });
		else {
			if (!pending.includes(clean)) onPendingChange([...pending, clean]);
			setEmail("");
		}
	};
	const chip =
		"inline-flex items-center gap-2 rounded-full border border-line-strong px-3.5 py-2 text-[14px]";

	return (
		<section className="flex flex-col gap-3.5 rounded-[26px] bg-panel p-[clamp(18px,3vw,28px)]">
			<StepHeading n={2} title="Hosts" />
			<div className="flex flex-wrap gap-2">
				{loaded ? (
					loaded.hosts.map((h) => (
						<span key={h.id} className={chip}>
							{h.name}
							{h.isOwner ? (
								<span className="text-haze">owner</span>
							) : (
								<button
									type="button"
									aria-label={`Remove ${h.name} as a host`}
									className="cursor-pointer border-0 bg-transparent text-haze hover:text-ink"
									onClick={() =>
										remove.mutate({ eventId: loaded.event.id, userId: h.id })
									}
								>
									×
								</button>
							)}
						</span>
					))
				) : (
					<span className={chip}>
						You <span className="text-haze">owner</span>
					</span>
				)}
				{pending.map((p) => (
					<span key={p} className={chip}>
						{p}
						<button
							type="button"
							aria-label={`Don't add ${p}`}
							className="cursor-pointer border-0 bg-transparent text-haze hover:text-ink"
							onClick={() => onPendingChange(pending.filter((x) => x !== p))}
						>
							×
						</button>
					</span>
				))}
			</div>
			{suggestions.length > 0 ? (
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="text-[13px] text-haze">Hosts you know:</span>
					{suggestions.slice(0, 8).map((p) => (
						<button
							key={p.userId}
							type="button"
							onClick={() => addEmail(p.email)}
							className="cursor-pointer rounded-full border border-line px-2.5 py-1 font-bold text-[12px] text-soft hover:border-lime hover:text-ink"
						>
							+ {p.name}
						</button>
					))}
				</div>
			) : null}
			<div className="flex flex-wrap gap-2">
				<Input
					type="email"
					value={email}
					aria-label="Co-host's email"
					placeholder="Add a co-host by email"
					onChange={(ev) => setEmail(ev.target.value)}
					onKeyDown={(ev) => {
						if (ev.key === "Enter") {
							ev.preventDefault();
							addEmail(email);
						}
					}}
					className="min-w-0 flex-[1_1_220px]"
				/>
				<Button
					variant="outline"
					disabled={add.isPending || !email.trim()}
					onClick={() => addEmail(email)}
				>
					Add co-host
				</Button>
			</div>
			<span className="text-[13px] text-haze">
				Co-hosts can edit the event, see the whole guest list and send for it.
				They have to be hosts on the site; an admin can make anyone a host.
				{loaded ? "" : " They're added when you save."}
			</span>
		</section>
	);
}

function DeleteDraft({ eventId }: { eventId: string }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [sure, setSure] = useState(false);
	const remove = useMutation(
		orpc.events.remove.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: orpc.events.key() });
				toast.success("Draft deleted.");
				navigate({ to: "/events" });
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);
	return sure ? (
		<span className="flex gap-2">
			<Button
				variant="destructive"
				disabled={remove.isPending}
				onClick={() => remove.mutate({ eventId })}
			>
				Delete it
			</Button>
			<Button variant="ghost" onClick={() => setSure(false)}>
				Keep
			</Button>
		</span>
	) : (
		<Button variant="ghost" className="mr-auto" onClick={() => setSure(true)}>
			Delete draft
		</Button>
	);
}

function CancelEvent({
	eventId,
	stillComing,
}: {
	eventId: string;
	stillComing: number;
}) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [note, setNote] = useState("");
	const [notify, setNotify] = useState(true);
	const cancel = useMutation(
		orpc.events.cancel.mutationOptions({
			onSuccess: async (r) => {
				await queryClient.invalidateQueries({ queryKey: orpc.events.key() });
				toast.success(
					r.notified > 0
						? `Canceled. Told ${plural(r.notified, "guest")}.`
						: "Canceled.",
				);
				navigate({ to: "/events" });
			},
			onError: (error: Error) => toast.error(error.message),
		}),
	);
	if (!open) {
		return (
			<Button
				variant="destructive"
				className="mr-auto"
				onClick={() => setOpen(true)}
			>
				Cancel event
			</Button>
		);
	}
	return (
		<div
			className={cn(
				"flex basis-full flex-col gap-3 rounded-[20px] border border-destructive/50 p-4",
			)}
		>
			<b>Cancel this event?</b>
			<Field label="A note for your guests (optional)" htmlFor="cancel-note">
				<Textarea
					id="cancel-note"
					value={note}
					maxLength={1000}
					onChange={(ev) => setNote(ev.target.value)}
				/>
			</Field>
			<div className="flex items-center gap-3 text-[14px]">
				<Switch
					label="Email the guests"
					checked={notify}
					onChange={setNotify}
				/>
				Email the {plural(stillComing, "guest")} who haven't said no
			</div>
			<div className="flex gap-2">
				<Button
					variant="destructive"
					disabled={cancel.isPending}
					onClick={() => cancel.mutate({ eventId, note, notify })}
				>
					Yes, cancel it
				</Button>
				<Button variant="ghost" onClick={() => setOpen(false)}>
					Never mind
				</Button>
			</div>
		</div>
	);
}
