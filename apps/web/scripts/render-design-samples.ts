/**
 * Renders every template at every print layout to PDFs, from Node, to
 * look at the paper side of designs without a browser:
 *
 *   pnpm --filter web exec tsx scripts/render-design-samples.ts <out dir> [cover.png]
 *
 * Also renders the classic (undesigned) card, so both layouts are checked
 * the same way. Given a PNG, templates are drawn with it as the cover too.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { facesOf, loadFaces } from "../../../packages/design/src/faces";
import { type FaceKey, parseFace } from "../../../packages/design/src/fonts";
import { SAMPLE_VALUES } from "../../../packages/design/src/placeholders";
import {
	fromTemplate,
	previewAssets,
	TEMPLATES,
} from "../../../packages/design/src/templates/index";
import { paperCardUrl } from "../../../packages/email/src/links";
import { layoutDesignInvites } from "../src/lib/design-pdf-core";
import { layoutPaperInvites } from "../src/lib/paper-pdf-core";
import { layoutsFor } from "../src/lib/paper-sizes";

const out = process.argv[2];
if (!out)
	throw new Error("Usage: render-design-samples.ts <out dir> [cover.png]");
const coverFile = process.argv[3];
const COVER_REF =
	"designs/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000001.png";
const coverBytes = coverFile ? readFileSync(coverFile) : null;
// A PNG's width and height sit at bytes 16 and 20 of its header.
const header = coverBytes
	? new DataView(coverBytes.buffer, coverBytes.byteOffset)
	: null;
const cover = header
	? { ref: COVER_REF, iw: header.getUint32(16), ih: header.getUint32(20) }
	: null;
const images = new Map<string, ArrayBuffer>(
	coverBytes
		? [
				[
					COVER_REF,
					coverBytes.buffer.slice(
						coverBytes.byteOffset,
						coverBytes.byteOffset + coverBytes.byteLength,
					) as ArrayBuffer,
				],
			]
		: [],
);
mkdirSync(out, { recursive: true });
const web = join(dirname(fileURLToPath(import.meta.url)), "..");

function woff(key: FaceKey): ArrayBuffer {
	const { font, weight, italic } = parseFace(key);
	const buf = readFileSync(
		join(
			web,
			"node_modules/@fontsource",
			font,
			"files",
			`${font}-latin-${weight}-${italic ? "italic" : "normal"}.woff`,
		),
	);
	return buf.buffer.slice(
		buf.byteOffset,
		buf.byteOffset + buf.byteLength,
	) as ArrayBuffer;
}

// The URLs printed cards carry, so each sample's code is its real size.
const card = (key: string) => paperCardUrl("https://rsvp.botch.com", key);

const guests = [
	{
		id: "1",
		name: "The Nguyens",
		url: card("0123456789abcdef"),
	},
	{
		id: "2",
		name: "Priya",
		url: card("fedcba9876543210"),
	},
	{
		id: "3",
		name: "Grandma and Grandpa Featherstonehaugh-Whittingham",
		url: card("0000000000000000"),
	},
];

// Templates' own pictures, from where the site serves them.
for (const t of TEMPLATES) {
	for (const [name, placed] of Object.entries(previewAssets(t))) {
		const file = t.assets?.[name]?.file;
		if (!file) continue;
		const buf = readFileSync(join(web, "public/templates", t.id, file));
		images.set(
			placed.ref,
			buf.buffer.slice(
				buf.byteOffset,
				buf.byteOffset + buf.byteLength,
			) as ArrayBuffer,
		);
	}
}

for (const [t, withCover] of TEMPLATES.flatMap((t) => [
	[t, false] as const,
	...(cover ? [[t, true] as const] : []),
])) {
	const design = fromTemplate(t, {
		cover: withCover ? cover : null,
		paper: true,
	});
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
				assets: { faces, fonts, images },
				title: SAMPLE_VALUES.title,
			});
			const file = join(
				out,
				`${t.id}${withCover ? "-cover" : ""}-${layout}${bleed ? "-bleed" : ""}.pdf`,
			);
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
