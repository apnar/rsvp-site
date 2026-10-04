import { Button } from "@rsvp-site/ui/components/button";
import { ImagePlus, Trash2 } from "lucide-react";
import { useRef } from "react";

import { shrinkCover } from "@/lib/shrink-image";

import type { EventDraft } from "./use-event-draft";

/**
 * The cover photo, for an event without a designed card. With no photo it
 * is a short strip: no cover is a fine answer (guests get the plum night),
 * so it shouldn't take the top of the form.
 */
export function CoverPicker({ draft }: { draft: EventDraft }) {
	const { coverShown } = draft;
	const fileRef = useRef<HTMLInputElement>(null);
	const pick = () => fileRef.current?.click();

	return (
		<div className="relative">
			{coverShown ? (
				<div className="relative aspect-[16/7] overflow-hidden rounded-[20px] bg-night">
					<img src={coverShown} alt="" className="size-full object-cover" />
					<div className="absolute right-3 bottom-3 flex gap-2">
						<Button variant="light" size="sm" onClick={pick}>
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
				</div>
			) : (
				<button
					type="button"
					onClick={pick}
					className="flex min-h-24 w-full cursor-pointer items-center justify-center gap-3 rounded-[20px] border border-line-strong border-dashed bg-night px-4 py-5 text-haze transition-colors hover:border-haze hover:text-ink"
				>
					<ImagePlus className="size-6 flex-none" strokeWidth={1.5} />
					<span className="text-left">
						<b className="block text-[15px]">Add a cover photo</b>
						<span className="text-[13px]">
							Optional. It heads the invite page and the emails.
						</span>
					</span>
				</button>
			)}
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
	);
}
