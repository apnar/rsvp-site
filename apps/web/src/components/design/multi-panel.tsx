import type { Design } from "@rsvp-site/design/schema";
import { Button } from "@rsvp-site/ui/components/button";
import { Trash2 } from "lucide-react";
import { useDesigner } from "./designer-context";
import { type Align, alignEls, removeUnlocked } from "./editor-state";
import { Section } from "./fields";

/** Several selected: line them up, or remove them. */
export function MultiPanel({ doc, ids }: { doc: Design; ids: string[] }) {
	const { set } = useDesigner();
	const free = doc.elements.filter((e) => ids.includes(e.id) && !e.locked);
	const btn = (label: string, to: Align) => (
		<Button
			variant="outline"
			size="sm"
			onClick={() => set(alignEls(doc, ids, to))}
		>
			{label}
		</Button>
	);
	return (
		<div className="flex flex-col gap-4">
			<Section title={`${ids.length} selected`}>
				<div className="flex flex-wrap gap-1.5">
					{btn("Left", "left")}
					{btn("Centre", "centre")}
					{btn("Right", "right")}
					{btn("Top", "top")}
					{btn("Middle", "middle")}
					{btn("Bottom", "bottom")}
				</div>
			</Section>
			<Button
				variant="destructive"
				size="sm"
				className="self-start"
				disabled={free.length === 0}
				onClick={() => set(removeUnlocked(doc, ids))}
			>
				<Trash2 /> Delete all {free.length}
			</Button>
		</div>
	);
}
