import type { ElementInput } from "../schema";
import { TEMPLATE_ASSETS } from "./assets";
import { qrBlock, type TextInput, text } from "./parts";
import type { Template } from "./types";

/**
 * Black crumpled paper, an engraved moon in its own glow between clouds,
 * geese crossing, and a stepped gold deco frame; a Garamond title over
 * widely spaced Merriweather. Laid out to the picture it was drawn from at
 * 1080 x 1350 (8x10): positions are that picture's, times 1000/1080, its
 * text sitting a little left of the middle as it does there.
 *
 * The moon, clouds, geese and paper are pictures the template ships with
 * (apps/web/public/templates/night-society); the frame is vector, two
 * stickers per corner (the third line is a duller gold in the original).
 */
const GOLD = "#c8a169";
const FRAME = "#c2ab86";
const FRAME_LINE = "#77744f";
const TEXT = "#b3a08a";
const K = 1000 / 1080;
const px = (n: number) => Math.round(n * K * 10) / 10;

export const nightSociety: Template = {
	id: "night-society",
	label: "Night society",
	assets: TEMPLATE_ASSETS["night-society"],
	build: ({ assets }) => {
		const art = (
			id: string,
			name: string,
			left: number,
			top: number,
		): ElementInput[] => {
			const a = assets[name];
			if (!a) return [];
			return [
				{
					id,
					type: "image",
					name: name.replace(/([A-Z])/g, " $1").toLowerCase(),
					x: px(left),
					y: px(top),
					w: px(a.iw),
					h: px(a.ih),
					ref: a.ref,
					iw: a.iw,
					ih: a.ih,
				},
			];
		};
		const side = px(400);
		const corner = (
			id: string,
			x: number,
			y: number,
			rot: number,
		): ElementInput[] => [
			{
				id,
				type: "sticker",
				name: "frame corner",
				x,
				y,
				w: side,
				h: side,
				rot,
				sticker: "deco-corner",
				color: FRAME,
			},
			{
				id: `${id}l`,
				type: "sticker",
				name: "frame line",
				x,
				y,
				w: side,
				h: side,
				rot,
				sticker: "deco-corner-line",
				color: FRAME_LINE,
			},
		];
		const far = 1000 - side;
		const bottom = 1250 - side;
		const line = (
			id: string,
			y: number,
			h: number,
			content: string,
			extra: Partial<Omit<TextInput, "type" | "id" | "text">> = {},
		): ElementInput =>
			text({
				id,
				x: 93,
				y,
				w: 800,
				h,
				text: content,
				font: "merriweather",
				weight: 400,
				size: 23.1,
				tracking: 0.1,
				lineHeight: 1.4,
				align: "center",
				fit: "shrink",
				color: TEXT,
				...extra,
			});
		const bg = assets.paper;
		return {
			v: 1,
			format: "8x10",
			background: bg
				? { kind: "image", ref: bg.ref, iw: bg.iw, ih: bg.ih }
				: { kind: "solid", color: "#14130f" },
			theme: {
				bg: "#14130f",
				panel: "#1f1d17",
				text: "#e9dfcb",
				accent: GOLD,
				accent2: "#b9825a",
				headingFont: "cormorant-garamond",
				bodyFont: "merriweather",
			},
			elements: [
				...corner("tl", 0, 0, 0),
				...corner("tr", far, 0, 90),
				...corner("br", far, bottom, 180),
				...corner("bl", 0, bottom, -90),
				...art("glow", "glow", 337, 126),
				...art("moon", "moon", 425, 214),
				...art("cloudsl", "cloudsLeft", 70, 98),
				...art("cloudsr", "cloudsRight", 540, 345),
				...art("goose", "goose", 912, 540),
				...art("geese", "geese", 104, 1038),
				{
					id: "title",
					type: "text",
					x: 33,
					y: 523.7,
					w: 920,
					h: 157.5,
					text: "{title}",
					font: "cormorant-garamond",
					weight: 600,
					size: 75,
					tracking: 0.02,
					lineHeight: 1.05,
					align: "center",
					valign: "bottom",
					fit: "shrink",
					color: GOLD,
					shadow: { color: "#060504", dx: 1, dy: 2 },
				},
				line("subtitle", 688.5, 32.4, "An Evening Gathering for {guest}", {
					weight: 700,
					italic: true,
				}),
				line("details", 760.8, 92, "{details}", { lineHeight: 1.64 }),
				line("when", 864.5, 32.4, "{date} @ {time}"),
				line("where", 907, 32.4, "{location}"),
				line("host", 1201, 22, "Hosted by {host}", {
					x: 362,
					w: 276,
					size: 15.7,
				}),
				// The QR code is part of the card whether or not the event is on
				// paper yet (it only ever prints), set in the frame's gold: dark
				// modules on a gold tile, which phones read as readily as black
				// on white, inside a thin gold rule like the frame's.
				{
					id: "qrrule",
					type: "rect",
					name: "QR frame",
					x: 692,
					y: 967,
					w: 166,
					h: 166,
					stroke: FRAME,
					strokeWidth: 1.6,
					show: "paper",
				},
				...qrBlock(
					true,
					{ x: 700, y: 975, size: 150 },
					{ font: "merriweather", color: GOLD },
					{
						fg: "#17140f",
						bg: GOLD,
						caption: {
							y: 975 + 150 + 6 + 12,
							text: "Scan to reply",
							size: 17,
							tracking: 0.08,
							italic: true,
						},
					},
				),
			],
		};
	},
};
