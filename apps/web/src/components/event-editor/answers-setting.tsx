import {
	type AnswerWords,
	answerWordsInput,
	DEFAULT_WORDS,
	PRESETS,
	presetOf,
	WORD_LIMITS,
} from "@rsvp-site/api/answer-words";
import { Input } from "@rsvp-site/ui/components/input";
import { useState } from "react";

import { SettingRow, Switch } from "@/components/controls";
import { NativeSelect } from "@/components/native-select";

import type { EventDraft } from "./use-event-draft";

const OWN = "own";

/** What each answer is, whatever the host calls it. */
const ROWS: { key: keyof Omit<AnswerWords, "submit">; name: string }[] = [
	{ key: "yes", name: "Yes" },
	{ key: "maybe", name: "Maybe" },
	{ key: "no", name: "No" },
	{ key: "none", name: "No reply" },
];

/**
 * The answers' words and whether maybe is offered. A preset covers the
 * three answers; "Your own words" opens all of them, no reply included,
 * each as the button ("Count me in!") and as the word after a number ("in").
 */
export function AnswersSetting({ draft }: { draft: EventDraft }) {
	const { form, set } = draft;
	const words = form.answerWords;
	const preset = presetOf(words);
	const ownNone =
		words.none.pick !== DEFAULT_WORDS.none.pick ||
		words.none.count !== DEFAULT_WORDS.none.count;
	// Picking "Your own words" opens the fields even while they still match
	// a preset, so the host has somewhere to start typing.
	const [opened, setOpened] = useState(false);
	const own = opened || preset === null || ownNone;
	const problem = answerWordsInput.safeParse(words).error?.issues[0]?.message;

	const setWord = (
		key: (typeof ROWS)[number]["key"],
		which: "pick" | "count",
		value: string,
	) =>
		set("answerWords", { ...words, [key]: { ...words[key], [which]: value } });

	return (
		<>
			<SettingRow title="Answers" hint="What guests pick from">
				<NativeSelect
					aria-label="Answers"
					value={own ? OWN : (preset ?? OWN)}
					onChange={(ev) => {
						const next = PRESETS.find((p) => p.id === ev.target.value);
						if (!next) {
							setOpened(true);
							return;
						}
						setOpened(false);
						set("answerWords", {
							...words,
							...next.words,
							none: DEFAULT_WORDS.none,
						});
					}}
				>
					{PRESETS.map((p) => (
						<option key={p.id} value={p.id}>
							{p.label}
						</option>
					))}
					<option value={OWN}>Your own words</option>
				</NativeSelect>
			</SettingRow>
			{own ? (
				<div className="-mt-1 grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-2.5 gap-y-2 pb-3.5">
					<span />
					<span className="text-[13px] text-haze">Button</span>
					<span className="text-[13px] text-haze">After a number</span>
					{ROWS.filter((r) => r.key !== "maybe" || form.allowMaybe).map((r) => (
						<WordRow
							key={r.key}
							name={r.name}
							pick={words[r.key].pick}
							count={words[r.key].count}
							onPick={(v) => setWord(r.key, "pick", v)}
							onCount={(v) => setWord(r.key, "count", v)}
						/>
					))}
					{problem ? (
						<span
							role="alert"
							className="col-span-full text-[13px] text-destructive"
						>
							{problem}
						</span>
					) : null}
				</div>
			) : null}
			<SettingRow
				title="Offer maybe"
				hint={
					form.allowMaybe
						? `“${words.yes.pick}”, “${words.maybe.pick}” or “${words.no.pick}”`
						: `Just “${words.yes.pick}” or “${words.no.pick}”. Anyone who already said “${words.maybe.pick}” keeps it.`
				}
			>
				<Switch
					label="Offer maybe"
					checked={form.allowMaybe}
					onChange={(v) => set("allowMaybe", v)}
				/>
			</SettingRow>
			<SettingRow title="RSVP button" hint="Under the answers on the invite">
				<Input
					aria-label="RSVP button"
					value={words.submit}
					maxLength={WORD_LIMITS.submit}
					placeholder={DEFAULT_WORDS.submit}
					onChange={(ev) =>
						set("answerWords", { ...words, submit: ev.target.value })
					}
					className="min-h-10 w-[200px] rounded-full py-2"
				/>
			</SettingRow>
		</>
	);
}

function WordRow({
	name,
	pick,
	count,
	onPick,
	onCount,
}: {
	name: string;
	pick: string;
	count: string;
	onPick: (v: string) => void;
	onCount: (v: string) => void;
}) {
	return (
		<>
			<span className="pr-1 font-bold text-[14px]">{name}</span>
			<Input
				aria-label={`${name}: button`}
				value={pick}
				maxLength={WORD_LIMITS.pick}
				onChange={(ev) => onPick(ev.target.value)}
				className="min-h-10 rounded-full py-2"
			/>
			<Input
				aria-label={`${name}: after a number`}
				value={count}
				maxLength={WORD_LIMITS.count}
				onChange={(ev) => onCount(ev.target.value)}
				className="min-h-10 rounded-full py-2"
			/>
		</>
	);
}
