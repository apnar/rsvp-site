import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { Label } from "@rsvp-site/ui/components/label";
import { useId, useState } from "react";

/**
 * How long a break lasts. Weeks, because that is the unit trips and busy spells come in.
 * 0 means open-ended: they come back when they say so.
 */
const DURATIONS = [
	{ weeks: 2, label: "Two weeks" },
	{ weeks: 4, label: "Four weeks" },
	{ weeks: 8, label: "Eight weeks" },
	{ weeks: 0, label: "Until I say otherwise" },
] as const;

export type BreakInput = { reason?: string; until?: number };

/** The end of a break, as a timestamp. Null for open-ended. */
export function untilFromWeeks(weeks: number): number | undefined {
	if (weeks <= 0) return undefined;
	return Date.now() + weeks * 7 * 24 * 60 * 60 * 1000;
}

/**
 * Reason and duration, plus the sentence that says what stepping away
 * actually costs. Used by a guest on their own account and by an admin
 * doing it for somebody who phoned it in.
 */
export function BreakForm({
	subject = "you",
	pending,
	onCancel,
	onSubmit,
}: {
	/** Whose break this is, for the warning: "you" or a first name. */
	subject?: string;
	pending?: boolean;
	onCancel: () => void;
	onSubmit: (input: BreakInput) => void;
}) {
	const reasonId = useId();
	const weeksId = useId();
	const [reason, setReason] = useState("");
	const [weeks, setWeeks] = useState<number>(4);
	const self = subject === "you";

	return (
		<form
			className="space-y-4"
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit({
					reason: reason.trim() || undefined,
					until: untilFromWeeks(weeks),
				});
			}}
		>
			<p className="max-w-[52ch] border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 leading-5">
				{self ? "You" : subject} will stop getting every event email — including
				the one that goes out when a venue is booked — and{" "}
				{self ? "you" : "they"} will not be on the sheet until{" "}
				{self ? "you're" : "they're"} back. The account stays put, and the links
				in old emails still sign {self ? "you" : "them"} in.
			</p>
			<div className="flex flex-wrap items-end gap-3">
				<div className="min-w-[240px] flex-1 space-y-1.5">
					<Label htmlFor={reasonId}>What's up? (optional)</Label>
					<Input
						id={reasonId}
						maxLength={200}
						placeholder="Travelling, back in a month"
						value={reason}
						onChange={(e) => setReason(e.target.value)}
					/>
				</div>
				<div className="min-w-[180px] space-y-1.5">
					<Label htmlFor={weeksId}>For how long</Label>
					<select
						id={weeksId}
						className="h-9 w-full border border-divider bg-surface px-2.5 text-sm"
						value={weeks}
						onChange={(e) => setWeeks(Number(e.target.value))}
					>
						{DURATIONS.map((d) => (
							<option key={d.weeks} value={d.weeks}>
								{d.label}
							</option>
						))}
					</select>
				</div>
				<div className="flex gap-2">
					<Button type="submit" size="sm" disabled={pending}>
						Hold {self ? "my" : "their"} spot
					</Button>
					<Button type="button" variant="ghost" size="sm" onClick={onCancel}>
						Never mind
					</Button>
				</div>
			</div>
		</form>
	);
}

/** "Suspended until Oct 7" / "Away — travelling", for a chip or a status line. */
export function describeBreak(input: {
	suspendedUntil: Date | string | null;
	reason: string | null;
}): string {
	const until = input.suspendedUntil
		? new Date(input.suspendedUntil).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
			})
		: null;
	const head = until ? `Back on ${until}` : "Away";
	return input.reason ? `${head} — ${input.reason}` : head;
}
