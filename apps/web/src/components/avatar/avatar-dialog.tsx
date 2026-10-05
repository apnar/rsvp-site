import { Button } from "@rsvp-site/ui/components/button";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { type Crop, START } from "@/lib/avatar-crop";
import { messageOf } from "@/lib/errors";
import { renderAvatar } from "@/lib/shrink-image";

import { AvatarCropper } from "./avatar-cropper";

/**
 * The framing step between picking a photo and saving it. Portalled to the
 * body: it opens from inside forms (the account page, an admin's details
 * dialog), and a dialog nested in a form would be part of that form.
 */
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
	const ref = useRef<HTMLDialogElement>(null);
	const id = useId();
	const [crop, setCrop] = useState<Crop>(START);
	const [busy, setBusy] = useState(false);

	// A native dialog gives the focus trap, Esc and inert background; it only
	// has to be opened once mounted.
	useEffect(() => {
		const dialog = ref.current;
		if (dialog && !dialog.open) dialog.showModal();
	}, []);

	async function save() {
		setBusy(true);
		try {
			const file = await renderAvatar(bitmap, crop);
			try {
				await onSave(file);
				ref.current?.close();
			} catch {
				// The query client has already toasted why; stay open to retry.
			}
		} catch (error) {
			toast.error(messageOf(error));
		} finally {
			setBusy(false);
		}
	}

	return createPortal(
		<dialog
			ref={ref}
			aria-labelledby={`${id}-title`}
			onClose={(e) => {
				// React carries `close` up its own tree, portals included: without
				// this, an admin's details dialog would shut along with this one.
				e.stopPropagation();
				onClose();
			}}
			className="m-auto max-h-[calc(100dvh-32px)] w-[min(440px,calc(100%-32px))] overflow-y-auto rounded-[26px] border border-line bg-panel p-6 text-ink backdrop:bg-night/80"
		>
			<div className="flex flex-col gap-4">
				<h2 id={`${id}-title`} className="m-0 text-[20px]">
					{title}
				</h2>
				<AvatarCropper bitmap={bitmap} crop={crop} setCrop={setCrop} />
				<div className="flex flex-wrap justify-end gap-2">
					<Button
						type="button"
						variant="ghost"
						onClick={() => ref.current?.close()}
					>
						Cancel
					</Button>
					<Button type="button" disabled={busy} onClick={() => void save()}>
						Save picture
					</Button>
				</div>
			</div>
		</dialog>,
		document.body,
	);
}
