import {
	STICKER_IDS,
	STICKERS,
	type StickerId,
} from "@rsvp-site/design/stickers";
import { cn } from "@rsvp-site/ui/lib/utils";
import { Plus } from "lucide-react";
import { designSrc } from "@/lib/design-src";
import type { ImageTray } from "./editor-state";

/** The event's uploaded images, and a button to add another. */
export function ImagePicker({
	tray,
	label,
	current,
	onPick,
}: {
	tray: ImageTray;
	label: string;
	/** The image in use now, marked as pressed. */
	current?: string;
	onPick: (ref: string, iw: number, ih: number) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			<span className="text-[12px] text-haze">{label}</span>
			<div className="grid grid-cols-4 gap-1.5">
				{tray.images.map((ref, i) => (
					<button
						key={ref}
						type="button"
						aria-label={`Use image ${i + 1}`}
						aria-pressed={ref === current}
						className="aspect-square cursor-pointer overflow-hidden rounded-[8px] border border-line-strong bg-night p-0 hover:border-lime aria-pressed:border-lime"
						onClick={async () => {
							const { iw, ih } = await tray.sizeOf(ref);
							onPick(ref, iw, ih);
						}}
					>
						<img
							src={designSrc(ref)}
							alt=""
							className="size-full object-cover"
							loading="lazy"
						/>
					</button>
				))}
				<label
					className={cn(
						"grid aspect-square cursor-pointer place-items-center rounded-[8px] border border-line-strong border-dashed text-haze hover:border-lime hover:text-ink",
						tray.busy && "pointer-events-none opacity-50",
					)}
					title="Upload an image"
				>
					<Plus className="size-5" />
					<span className="sr-only">Upload an image</span>
					<input
						type="file"
						accept="image/jpeg,image/png,image/webp"
						className="sr-only"
						disabled={tray.busy}
						onChange={async (e) => {
							const file = e.target.files?.[0];
							e.target.value = "";
							if (!file) return;
							const up = await tray.upload(file);
							if (up) onPick(up.ref, up.iw, up.ih);
						}}
					/>
				</label>
			</div>
		</div>
	);
}

export function StickerGrid({
	value,
	color,
	onPick,
}: {
	value?: StickerId;
	color: string;
	onPick: (s: StickerId) => void;
}) {
	return (
		<div className="grid grid-cols-6 gap-1">
			{STICKER_IDS.map((s) => (
				<button
					key={s}
					type="button"
					title={s.replace(/-/g, " ")}
					aria-label={s.replace(/-/g, " ")}
					aria-pressed={s === value}
					onClick={() => onPick(s)}
					className={cn(
						"grid aspect-square cursor-pointer place-items-center rounded-[8px] border border-transparent bg-transparent p-1 hover:border-line-strong",
						s === value && "border-lime",
					)}
				>
					<svg viewBox="0 0 256 256" className="size-full" aria-hidden>
						<path d={STICKERS[s]} fill={color} />
					</svg>
				</button>
			))}
		</div>
	);
}
