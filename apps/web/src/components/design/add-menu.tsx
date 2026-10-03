import type { Design, Element } from "@rsvp-site/design/schema";
import { Button } from "@rsvp-site/ui/components/button";
import {
	Circle,
	Image,
	Minus,
	QrCode,
	Smile,
	Square,
	Type,
} from "lucide-react";
import { useState } from "react";
import { newImage, newQr, newShape, newSticker, newText } from "./editor-state";
import { ImagePicker, type ImageTray, StickerGrid } from "./inspector";

/** Things to put on the card. */
export function AddMenu({
	doc,
	paper,
	tray,
	onAdd,
}: {
	doc: Design;
	paper: boolean;
	tray: ImageTray;
	onAdd: (el: Element) => void;
}) {
	const [open, setOpen] = useState<"sticker" | "image" | null>(null);
	const hasQr = doc.elements.some((e) => e.type === "qr");
	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap gap-1.5">
				<Button variant="outline" size="sm" onClick={() => onAdd(newText(doc))}>
					<Type /> Text
				</Button>
				<Button
					variant={open === "image" ? "light" : "outline"}
					size="sm"
					onClick={() => setOpen(open === "image" ? null : "image")}
				>
					<Image /> Image
				</Button>
				<Button
					variant={open === "sticker" ? "light" : "outline"}
					size="sm"
					onClick={() => setOpen(open === "sticker" ? null : "sticker")}
				>
					<Smile /> Sticker
				</Button>
				<Button
					variant="outline"
					size="sm"
					aria-label="Rectangle"
					onClick={() => onAdd(newShape(doc, "rect"))}
				>
					<Square />
				</Button>
				<Button
					variant="outline"
					size="sm"
					aria-label="Ellipse"
					onClick={() => onAdd(newShape(doc, "ellipse"))}
				>
					<Circle />
				</Button>
				<Button
					variant="outline"
					size="sm"
					aria-label="Line"
					onClick={() => onAdd(newShape(doc, "line"))}
				>
					<Minus />
				</Button>
				{paper && !hasQr ? (
					<Button variant="outline" size="sm" onClick={() => onAdd(newQr(doc))}>
						<QrCode /> QR code
					</Button>
				) : null}
			</div>
			{open === "sticker" ? (
				<StickerGrid
					color={doc.theme.accent2}
					onPick={(s) => {
						onAdd(newSticker(doc, s));
						setOpen(null);
					}}
				/>
			) : null}
			{open === "image" ? (
				<ImagePicker
					tray={tray}
					label="Your images"
					onPick={(ref, iw, ih) => {
						onAdd(newImage(doc, ref, iw, ih));
						setOpen(null);
					}}
				/>
			) : null}
		</div>
	);
}
