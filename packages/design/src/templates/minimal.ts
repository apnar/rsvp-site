import type { ElementInput } from "../schema";
import { qrBlock } from "./parts";
import type { Template } from "./types";

const INK = "#111111";
const RED = "#e4572e";

/** White, one grotesque, a red rule. The facts, and nothing in their way. */
export const minimal: Template = {
	id: "minimal",
	label: "Minimal",
	build: ({ cover, paper }) => {
		const photo: ElementInput[] = cover
			? [
					{
						id: "photo",
						type: "image",
						x: 80,
						y: 80,
						w: 840,
						h: 480,
						ref: cover.ref,
						iw: cover.iw,
						ih: cover.ih,
					},
				]
			: [];
		const top = cover ? 620 : 160;
		return {
			v: 1,
			format: "5x7",
			background: { kind: "solid", color: "#ffffff" },
			theme: {
				bg: "#f6f6f4",
				panel: "#ffffff",
				text: INK,
				accent: INK,
				accent2: RED,
				headingFont: "space-grotesk",
				bodyFont: "space-grotesk",
			},
			elements: [
				...photo,
				{
					id: "title",
					type: "text",
					x: 80,
					y: top,
					w: 840,
					h: cover ? 260 : 520,
					text: "{title}",
					font: "space-grotesk",
					weight: 700,
					size: cover ? 96 : 140,
					lineHeight: 0.98,
					tracking: -0.03,
					valign: "bottom",
					fit: "shrink",
					color: INK,
				},
				{
					id: "rule",
					type: "rect",
					x: 80,
					y: cover ? 905 : 720,
					w: 120,
					h: 12,
					fill: RED,
				},
				{
					id: "facts",
					type: "text",
					x: 80,
					y: cover ? 950 : 780,
					w: paper ? 540 : 840,
					h: 240,
					text: "{date}\n{time}\n{location}",
					font: "space-grotesk",
					weight: 400,
					size: 40,
					lineHeight: 1.35,
					color: INK,
				},
				{
					id: "foot",
					type: "text",
					x: 80,
					y: 1250,
					w: paper ? 540 : 840,
					h: 70,
					text: "Hosted by {host}. RSVP by {rsvp by}.",
					font: "space-grotesk",
					weight: 400,
					size: 26,
					lineHeight: 1.3,
					color: "#6b6b6b",
				},
				...qrBlock(
					paper,
					{ x: 700, y: 1060, size: 200 },
					{ font: "space-grotesk", color: INK },
				),
			],
		};
	},
};
