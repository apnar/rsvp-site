import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { facesOf, loadFaces } from "@rsvp-site/design/faces";
import { type FaceKey, parseFace } from "@rsvp-site/design/fonts";
import { SAMPLE_VALUES } from "@rsvp-site/design/placeholders";
import {
	fromTemplate,
	previewAssets,
	TEMPLATES,
} from "@rsvp-site/design/templates/index";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { layoutDesignInvites } from "./design-pdf-core";
import { layoutPaperInvites } from "./paper-pdf-core";
import { layoutsFor } from "./paper-sizes";

/**
 * Every template through the paper layout, from Node: the same setup as
 * scripts/render-design-samples.ts, which renders them to files to look at.
 * This only asks that each one builds into a PDF with pages.
 */
const web = join(dirname(fileURLToPath(import.meta.url)), "../..");

const exact = (buf: Buffer): ArrayBuffer =>
	buf.buffer.slice(
		buf.byteOffset,
		buf.byteOffset + buf.byteLength,
	) as ArrayBuffer;

const woff = (key: FaceKey) => {
	const { font, weight, italic } = parseFace(key);
	return exact(
		readFileSync(
			join(
				web,
				"node_modules/@fontsource",
				font,
				"files",
				`${font}-latin-${weight}-${italic ? "italic" : "normal"}.woff`,
			),
		),
	);
};

const images = new Map<string, ArrayBuffer>();
for (const t of TEMPLATES) {
	for (const [name, placed] of Object.entries(previewAssets(t))) {
		const file = t.assets?.[name]?.file;
		if (file) {
			images.set(
				placed.ref,
				exact(readFileSync(join(web, "public/templates", t.id, file))),
			);
		}
	}
}

const guests = [
	{
		id: "1",
		name: "The Nguyens",
		url: "https://rsvp.botch.com/p/a",
	},
	{ id: "2", name: "Priya", url: "https://rsvp.botch.com/p/b" },
	{
		id: "3",
		name: "Coach Dana",
		url: "https://rsvp.botch.com/p/c",
	},
];

const pagesOf = async (pdf: Uint8Array) =>
	(await PDFDocument.load(pdf)).getPageCount();

describe("every template builds a paper PDF", () => {
	it("has templates to test", () => {
		expect(TEMPLATES.length).toBeGreaterThan(0);
	});

	it.each(TEMPLATES.map((t) => [t.id, t] as const))(
		"%s",
		async (_id, template) => {
			const design = fromTemplate(template, { cover: null, paper: true });
			const keys = facesOf(design);
			const faces = await loadFaces(keys);
			const fonts = new Map(keys.map((k) => [k, woff(k)]));
			for (const { value: layout } of layoutsFor(design.format)) {
				const pdf = await layoutDesignInvites({
					design,
					values: SAMPLE_VALUES,
					guests,
					layout,
					assets: { faces, fonts, images },
					title: SAMPLE_VALUES.title,
				});
				expect(pdf.length).toBeGreaterThan(0);
				expect(await pagesOf(pdf)).toBeGreaterThan(0);
			}
		},
		30_000,
	);

	it("builds the classic card", async () => {
		const font = (f: string) =>
			exact(readFileSync(join(web, "node_modules/@fontsource", f)));
		const pdf = await layoutPaperInvites({
			event: {
				title: SAMPLE_VALUES.title,
				hostLine: SAMPLE_VALUES.host,
				location: SAMPLE_VALUES.location,
				details: "Bring a blanket and a camp chair.",
				coverKey: null,
				dateLabel: SAMPLE_VALUES.date,
				timeLabel: SAMPLE_VALUES.time,
				deadlineLabel: SAMPLE_VALUES.rsvpBy,
			},
			guests,
			size: "card",
			assets: {
				black: font("unbounded/files/unbounded-latin-900-normal.woff"),
				bold: font("unbounded/files/unbounded-latin-700-normal.woff"),
				body: font("manrope/files/manrope-latin-500-normal.woff"),
				bodyBold: font("manrope/files/manrope-latin-700-normal.woff"),
				cover: null,
			},
		});
		expect(await pagesOf(pdf)).toBeGreaterThan(0);
	});
});
