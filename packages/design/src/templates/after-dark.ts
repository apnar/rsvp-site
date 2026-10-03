import type { ElementInput } from "../schema";
import { AFTER_DARK_THEME } from "../theme";
import type { Template } from "./types";

/**
 * Today's paper card, rebuilt from elements: the plum band with the title
 * at its foot, the lime tag, the facts on white, the QR at bottom right.
 * Measures follow paper-pdf-core.ts (a 5x7 card at 1000 units across is
 * 2.78 units to its point).
 */
const NIGHT = "#14101f";
const INK = "#1f1930";
const MUTED = "#5e5577";
const PINK_TEXT = "#b0236c";
const BAND = 588;
const PAD = 61;

export const afterDark: Template = {
	id: "after-dark",
	label: "After Dark",
	build: ({ cover, paper }) => {
		const band: ElementInput[] = cover
			? [
					{
						id: "cover",
						type: "image",
						x: 0,
						y: 0,
						w: 1000,
						h: BAND,
						ref: cover.ref,
						iw: cover.iw,
						ih: cover.ih,
					},
					{
						id: "wash",
						type: "rect",
						x: 0,
						y: BAND * 0.38,
						w: 1000,
						h: BAND * 0.62,
						fill: NIGHT,
						opacity: 0.62,
					},
				]
			: [
					{
						id: "band",
						type: "rect",
						x: 0,
						y: 0,
						w: 1000,
						h: BAND,
						fill: NIGHT,
					},
					{
						id: "glow1",
						type: "ellipse",
						x: 50,
						y: 30,
						w: 340,
						h: 340,
						fill: "#c6ff3d",
						opacity: 0.18,
					},
					{
						id: "glow2",
						type: "ellipse",
						x: 620,
						y: 220,
						w: 360,
						h: 360,
						fill: "#ff4fa3",
						opacity: 0.2,
					},
				];
		const fact = (
			id: string,
			y: number,
			label: string,
			value: string,
		): ElementInput[] => [
			{
				id: `${id}l`,
				type: "text",
				x: PAD,
				y,
				w: 520,
				h: 26,
				text: label,
				font: "unbounded",
				weight: 700,
				size: 19,
				tracking: 0.08,
				color: MUTED,
			},
			{
				id: `${id}v`,
				type: "text",
				x: PAD,
				y: y + 28,
				w: paper ? 520 : 878,
				h: 72,
				text: value,
				font: "manrope",
				weight: 800,
				size: 29,
				lineHeight: 1.2,
				color: INK,
			},
		];
		const print: ElementInput[] = paper
			? [
					{
						id: "qr",
						type: "qr",
						x: 611,
						y: 972,
						w: 328,
						h: 328,
						show: "paper",
					},
					{
						id: "scan",
						type: "text",
						x: 611,
						y: 1306,
						w: 328,
						h: 30,
						text: "Scan to RSVP",
						font: "unbounded",
						weight: 700,
						size: 22,
						align: "center",
						color: PINK_TEXT,
						show: "paper",
					},
					{
						id: "point",
						type: "text",
						x: PAD,
						y: 1250,
						w: 500,
						h: 90,
						text: "Point your phone's camera at the code to answer and see the details.",
						font: "manrope",
						weight: 400,
						size: 22,
						lineHeight: 1.3,
						color: MUTED,
						show: "paper",
					},
				]
			: [];
		return {
			v: 1,
			format: "5x7",
			background: { kind: "solid", color: "#ffffff" },
			theme: AFTER_DARK_THEME,
			elements: [
				...band,
				{
					id: "tag",
					type: "rect",
					x: PAD,
					y: 262,
					w: 236,
					h: 40,
					fill: "#c6ff3d",
				},
				{
					id: "tagtext",
					type: "text",
					x: PAD,
					y: 262,
					w: 236,
					h: 40,
					text: "You're invited",
					upper: true,
					font: "unbounded",
					weight: 700,
					size: 19,
					tracking: 0.04,
					align: "center",
					valign: "middle",
					color: NIGHT,
				},
				{
					id: "title",
					type: "text",
					x: PAD,
					y: 316,
					w: 878,
					h: 228,
					text: "{title}",
					font: "unbounded",
					weight: 900,
					size: 83,
					lineHeight: 1.02,
					valign: "bottom",
					fit: "shrink",
					color: "#ffffff",
				},
				{
					id: "greeting",
					type: "text",
					x: PAD,
					y: 640,
					w: 878,
					h: 50,
					text: "For {guest}",
					font: "manrope",
					weight: 800,
					size: 36,
					fit: "shrink",
					color: INK,
				},
				...fact("when", 730, "WHEN", "{date} · {time}"),
				...fact("where", 845, "WHERE", "{location}"),
				...fact("host", 960, "HOSTED BY", "{host}"),
				{
					id: "rsvp",
					type: "text",
					x: PAD,
					y: 1190,
					w: 520,
					h: 44,
					text: "Please RSVP by {rsvp by}.",
					font: "manrope",
					weight: 800,
					size: 28,
					color: PINK_TEXT,
				},
				...print,
			],
		};
	},
};
