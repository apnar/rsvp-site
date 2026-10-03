import { fontStack } from "@rsvp-site/design/fonts";
import type { Design, DesignTheme } from "@rsvp-site/design/schema";
import { contrast, onColor } from "@rsvp-site/design/theme";
import { useDesigner } from "./designer-context";
import { ColorField, FontField, Row, Section } from "./fields";

export function ThemeFields({ doc }: { doc: Design }) {
	const { set } = useDesigner();
	const t = doc.theme;
	const put = (p: Partial<DesignTheme>, key: string) =>
		set({ ...doc, theme: { ...t, ...p } }, `theme:${key}`);
	const readable =
		contrast(t.text, t.bg) >= 4.5 && contrast(t.text, t.panel) >= 4.5;
	return (
		<Section title="The page around it">
			<p className="m-0 text-[13px] text-haze">
				Guests answer below the card. These set that part of the page.
			</p>
			<Row>
				<ColorField
					label="Page"
					value={t.bg}
					onChange={(bg) => put({ bg }, "bg")}
				/>
				<ColorField
					label="Panels"
					value={t.panel}
					onChange={(panel) => put({ panel }, "panel")}
				/>
			</Row>
			<Row>
				<ColorField
					label="Text"
					value={t.text}
					onChange={(text) => put({ text }, "text")}
				/>
				<ColorField
					label="Yes and buttons"
					value={t.accent}
					onChange={(accent) => put({ accent }, "accent")}
				/>
			</Row>
			<Row>
				<ColorField
					label="Maybe and send"
					value={t.accent2}
					onChange={(accent2) => put({ accent2 }, "accent2")}
				/>
			</Row>
			<Row>
				<FontField
					label="Headings"
					value={t.headingFont}
					onChange={(headingFont) => put({ headingFont }, "hf")}
				/>
				<FontField
					label="Body"
					value={t.bodyFont}
					onChange={(bodyFont) => put({ bodyFont }, "bf")}
				/>
			</Row>
			<div
				className="flex flex-col gap-2 rounded-[14px] p-3"
				style={{
					background: t.bg,
					color: t.text,
					fontFamily: fontStack(t.bodyFont),
				}}
			>
				<div className="rounded-[10px] p-3" style={{ background: t.panel }}>
					<b style={{ fontFamily: fontStack(t.headingFont) }}>You coming?</b>
					<div className="mt-2 flex gap-1.5 text-[13px]">
						<span
							className="rounded-full px-3 py-1"
							style={{ background: t.accent, color: onColor(t.accent) }}
						>
							Yes!
						</span>
						<span
							className="rounded-full px-3 py-1"
							style={{ background: t.accent2, color: onColor(t.accent2) }}
						>
							Maybe
						</span>
					</div>
				</div>
			</div>
			{readable ? null : (
				<p className="m-0 text-[13px] text-pink-ink">
					The text is hard to read on that page or panel colour.
				</p>
			)}
		</Section>
	);
}
