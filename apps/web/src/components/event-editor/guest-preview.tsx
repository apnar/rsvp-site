import { DEFAULT_WORDS } from "@rsvp-site/api/answer-words";
import { formatDate, formatTimeRange } from "@rsvp-site/api/time";
import { buttonVariants } from "@rsvp-site/ui/components/button";

import { AnswerPicker } from "@/components/controls";
import { Cover } from "@/components/cover";
import { CardSvg } from "@/components/design/card-svg";

import type { Loaded } from "./form";
import type { EventDraft } from "./use-event-draft";

/** What a guest will see, from the draft as it stands. */
export function GuestPreview({
	loaded,
	draft,
}: {
	loaded?: Loaded;
	draft: EventDraft;
}) {
	const { form, coverShown } = draft;
	return (
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
							<img src={coverShown} alt="" className="size-full object-cover" />
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
					<div
						className="pointer-events-none flex flex-col gap-2.5 p-3.5"
						inert
					>
						<AnswerPicker
							answers={{ words: form.answerWords, maybe: form.allowMaybe }}
							value="yes"
							onChange={() => {}}
							size="sm"
							name="preview"
						/>
						<span className={buttonVariants({ variant: "send", size: "sm" })}>
							{form.answerWords.submit || DEFAULT_WORDS.submit}
						</span>
					</div>
				</div>
			)}
		</aside>
	);
}
