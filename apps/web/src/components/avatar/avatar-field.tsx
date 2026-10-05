import { Button } from "@rsvp-site/ui/components/button";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/brand";
import { ConfirmAction } from "@/components/confirm-action";
import { initials } from "@/lib/format";
import { decodeForCrop } from "@/lib/shrink-image";

import { AvatarDialog } from "./avatar-dialog";

/**
 * Somebody's picture with the ways to change it: pick a photo, frame it,
 * save; or take it down. `mine` only changes the words.
 */
export function AvatarField({
	name,
	image,
	mine,
	pending = false,
	onSave,
	onRemove,
}: {
	name: string;
	image: string | null;
	mine: boolean;
	pending?: boolean;
	onSave: (file: File) => Promise<unknown>;
	onRemove: () => Promise<unknown>;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);

	// The decoded photo is a sizeable chunk of memory; let it go.
	useEffect(() => () => bitmap?.close(), [bitmap]);

	async function pick(file: File | undefined) {
		if (!file) return;
		try {
			setBitmap(await decodeForCrop(file));
		} catch {
			toast.error("That photo couldn't be opened. Try a JPEG or PNG.");
		}
	}

	return (
		<div className="flex flex-wrap items-center gap-4">
			<Avatar
				initials={initials(name)}
				image={image}
				className="size-24 text-[28px]"
			/>
			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={pending}
					onClick={() => inputRef.current?.click()}
				>
					{image ? "Change picture" : "Add a picture"}
				</Button>
				{image ? (
					<ConfirmAction
						trigger={{
							type: "button",
							variant: "ghost",
							size: "sm",
							disabled: pending,
							children: "Remove",
						}}
						confirm="Remove picture"
						pending={pending}
						onConfirm={(close) => {
							onRemove().then(close, () => {});
						}}
					/>
				) : null}
			</div>
			<input
				ref={inputRef}
				type="file"
				accept="image/jpeg,image/png,image/webp"
				className="hidden"
				aria-label={mine ? "Your picture" : `${name}'s picture`}
				onChange={(e) => {
					void pick(e.target.files?.[0]);
					// Picking the same file again should open it again.
					e.target.value = "";
				}}
			/>
			{bitmap ? (
				<AvatarDialog
					bitmap={bitmap}
					title={mine ? "Frame your picture" : `Frame ${name}'s picture`}
					onSave={onSave}
					onClose={() => setBitmap(null)}
				/>
			) : null}
		</div>
	);
}
