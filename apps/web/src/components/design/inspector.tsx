/**
 * The designer's right-hand panel: the selected element's settings, or,
 * with nothing selected, the card's (its shape, background) and the page
 * theme the guest page takes from it. The parts live beside this file.
 */
import {
	type Design,
	FORMAT_IDS,
	FORMATS,
	type Format,
} from "@rsvp-site/design/schema";
import { memo, type RefObject } from "react";
import { BackgroundFields } from "./background-fields";
import { useDesigner } from "./designer-context";
import { reshape } from "./editor-state";
import { ElementPanel } from "./element-panel";
import { Check, Section, SelectField } from "./fields";
import { MultiPanel } from "./multi-panel";
import { ThemeFields } from "./theme-fields";

/** Nothing selected: the card itself, and the page around it. */
function CardPanel({ doc }: { doc: Design }) {
	const { set, paper } = useDesigner();
	return (
		<div className="flex flex-col gap-4">
			<Section title="Card">
				<SelectField
					label="Shape"
					value={doc.format}
					options={FORMAT_IDS.map((f) => ({
						value: f,
						label: FORMATS[f].label,
					}))}
					onChange={(format: Format) => set(reshape(doc, format))}
				/>
				{paper ? (
					<Check
						label="Print-shop bleed (⅛ inch past the edge, with crop marks)"
						checked={doc.bleed}
						onChange={(bleed) => set({ ...doc, bleed })}
					/>
				) : null}
			</Section>
			<BackgroundFields doc={doc} />
			<ThemeFields doc={doc} />
		</div>
	);
}

/** Which panel the selection calls for. */
export const Inspector = memo(function Inspector({
	doc,
	selected,
	textRef,
}: {
	doc: Design;
	selected: string[];
	textRef: RefObject<HTMLTextAreaElement | null>;
}) {
	const one =
		selected.length === 1
			? doc.elements.find((x) => x.id === selected[0])
			: undefined;
	return one ? (
		<ElementPanel el={one} doc={doc} textRef={textRef} />
	) : selected.length > 1 ? (
		<MultiPanel doc={doc} ids={selected} />
	) : (
		<CardPanel doc={doc} />
	);
});
