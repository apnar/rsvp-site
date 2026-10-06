import { Button } from "@rsvp-site/ui/components/button";
import { useState } from "react";
import { toast } from "sonner";

import { type Crop, START } from "@/lib/avatar-crop";
import { messageOf } from "@/lib/errors";
import { renderAvatar } from "@/lib/shrink-image";

import { Modal } from "../modal";
import { AvatarCropper } from "./avatar-cropper";

/** The framing step between picking a photo and saving it. */
export function AvatarDialog({
	bitmap,
	title,
	onSave,
	onClose,
}: {
	bitmap: ImageBitmap;
	title: string;
	onSave: (file: File) => Promise<unknown>;
	onClose: () => void;
}) {
	return (
		<Modal title={title} onClose={onClose}>
			{(close) => <Framing bitmap={bitmap} onSave={onSave} close={close} />}
		</Modal>
	);
}

function Framing({
	bitmap,
	onSave,
	close,
}: {
	bitmap: ImageBitmap;
	onSave: (file: File) => Promise<unknown>;
	close: () => void;
}) {
	const [crop, setCrop] = useState<Crop>(START);
	const [busy, setBusy] = useState(false);

	async function save() {
		setBusy(true);
		try {
			const file = await renderAvatar(bitmap, crop);
			try {
				await onSave(file);
				close();
			} catch {
				// The query client has already toasted why; stay open to retry.
			}
		} catch (error) {
			toast.error(messageOf(error));
		} finally {
			setBusy(false);
		}
	}

	return (
		<>
			<AvatarCropper bitmap={bitmap} crop={crop} setCrop={setCrop} />
			<div className="flex flex-wrap justify-end gap-2">
				<Button type="button" variant="ghost" onClick={close}>
					Cancel
				</Button>
				<Button type="button" disabled={busy} onClick={() => void save()}>
					Save picture
				</Button>
			</div>
		</>
	);
}
