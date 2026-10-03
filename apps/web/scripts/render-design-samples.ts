/**
 * Renders every template at every print layout to PDFs, from Node, to
 * look at the paper side of designs without a browser:
 *
 *   pnpm --filter web exec tsx scripts/render-design-samples.ts <out dir>
 *
 * Also renders the classic (undesigned) card, so both layouts are checked
 * the same way. Images are left out: templates are drawn without a cover.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { facesOf, loadFaces } from "../../../packages/design/src/faces";
import type { FaceKey, FontId } from "../../../packages/design/src/fonts";
import { SAMPLE_VALUES } from "../../../packages/design/src/placeholders";
import {
	fromTemplate,
	TEMPLATES,
} from "../../../packages/design/src/templates/index";
import { layoutDesignInvites } from "../src/lib/design-pdf-core";
import { layoutPaperInvites } from "../src/lib/paper-pdf-core";
import { layoutsFor } from "../src/lib/paper-sizes";

const out = process.argv[2];
if (!out) throw new Error("Usage: render-design-samples.ts <out dir>");
mkdirSync(out, { recursive: true });
const web = join(dirname(fileURLToPath(import.meta.url)), "..");

function woff(key: FaceKey): ArrayBuffer {
	const cut = key.lastIndexOf("-");
	const id = key.slice(0, cut) as FontId;
	const weight = key.slice(cut + 1);
	const buf = readFileSync(
		join(
			web,
			"node_modules/@fontsource",
			id,
			"files",
			`${id}-latin-${weight}-normal.woff`,
		),
	);
	return buf.buffer.slice(
		buf.byteOffset,
		buf.byteOffset + buf.byteLength,
	) as ArrayBuffer;
}

const guests = [
	{
		id: "1",
		name: "The Nguyens",
		url: "https://rsvp.botch.com/api/auth/paper?k=0123456789abcdef0123456789abcdef",
	},
	{
		id: "2",
		name: "Priya",
		url: "https://rsvp.botch.com/api/auth/paper?k=fedcba9876543210fedcba9876543210",
	},
	{
		id: "3",
		name: "Grandma and Grandpa Featherstonehaugh-Whittingham",
		url: "https://rsvp.botch.com/api/auth/paper?k=00000000000000000000000000000000",
	},
];

for (const t of TEMPLATES) {
	const design = fromTemplate(t, { cover: null, paper: true });
	const keys = facesOf(design);
	const faces = await loadFaces(keys);
	const fonts = new Map(keys.map((k) => [k, woff(k)]));
	for (const bleed of [false, true]) {
		for (const { value: layout } of layoutsFor(design.format)) {
			const pdf = await layoutDesignInvites({
				design: { ...design, bleed },
				values: SAMPLE_VALUES,
				guests,
				layout,
				assets: { faces, fonts, images: new Map() },
				title: SAMPLE_VALUES.title,
			});
			const file = join(out, `${t.id}-${layout}${bleed ? "-bleed" : ""}.pdf`);
			writeFileSync(file, pdf);
			console.log(file, `${Math.round(pdf.length / 1024)} KB`);
		}
	}
}

const classicFont = (f: string) => {
	const buf = readFileSync(join(web, "node_modules/@fontsource", f));
	return buf.buffer.slice(
		buf.byteOffset,
		buf.byteOffset + buf.byteLength,
	) as ArrayBuffer;
};
const classic = await layoutPaperInvites({
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
		black: classicFont("unbounded/files/unbounded-latin-900-normal.woff"),
		bold: classicFont("unbounded/files/unbounded-latin-700-normal.woff"),
		body: classicFont("manrope/files/manrope-latin-500-normal.woff"),
		bodyBold: classicFont("manrope/files/manrope-latin-700-normal.woff"),
		cover: null,
	},
});
writeFileSync(join(out, "classic-card.pdf"), classic);
console.log(join(out, "classic-card.pdf"));
