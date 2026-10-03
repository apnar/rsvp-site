import type { ElementInput } from "../schema";
import { qrBlock } from "./parts";
import type { Template } from "./types";

const TEAL = "#4fd1c5";
const AMBER = "#f6ad55";

/** The photo is the card: full bleed, a dark fade, a tall condensed title. */
export const poster: Template = {
	id: "poster",
	label: "Photo poster",
	build: ({ cover, paper }) => {
		const ground: ElementInput[] = cover
			? [
					{
						id: "photo",
						type: "image",
						x: 0,
						y: 0,
						w: 1000,
						h: 1400,
						ref: cover.ref,
						iw: cover.iw,
						ih: cover.ih,
					},
					{
						id: "fade",
						type: "rect",
						x: 0,
						y: 700,
						w: 1000,
						h: 700,
						fill: "#10131a",
						opacity: 0.72,
					},
				]
			: [
					{
						id: "burst",
						type: "sticker",
						x: 230,
						y: 120,
						w: 540,
						h: 540,
						sticker: "confetti",
						color: TEAL,
						opacity: 0.9,
					},
				];
		return {
			v: 1,
			format: "5x7",
			background: {
				kind: "linear",
				angle: 160,
				stops: [
					{ at: 0, color: "#1d4e5f" },
					{ at: 1, color: "#10131a" },
				],
			},
			theme: {
				bg: "#10131a",
				panel: "#1b2130",
				text: "#f2f4f8",
				accent: TEAL,
				accent2: AMBER,
				headingFont: "bebas-neue",
				bodyFont: "manrope",
			},
			elements: [
				...ground,
				{
					id: "kicker",
					type: "text",
					x: 70,
					y: 740,
					w: 860,
					h: 44,
					text: "You're invited",
					upper: true,
					font: "manrope",
					weight: 800,
					size: 30,
					tracking: 0.2,
					color: TEAL,
				},
				{
					id: "title",
					type: "text",
					x: 70,
					y: 790,
					w: 860,
					h: 280,
					text: "{title}",
					font: "bebas-neue",
					size: 170,
					lineHeight: 0.92,
					valign: "top",
					fit: "shrink",
					color: "#ffffff",
				},
				{
					id: "facts",
					type: "text",
					x: 70,
					y: 1090,
					w: paper ? 560 : 860,
					h: 160,
					text: "{date} · {time}\n{location}",
					font: "manrope",
					weight: 600,
					size: 34,
					lineHeight: 1.35,
					color: "#f2f4f8",
				},
				{
					id: "rsvp",
					type: "text",
					x: 70,
					y: 1270,
					w: paper ? 560 : 860,
					h: 44,
					text: "RSVP by {rsvp by}",
					font: "manrope",
					weight: 800,
					size: 28,
					color: AMBER,
				},
				...qrBlock(
					paper,
					{ x: 720, y: 1080, size: 200 },
					{ font: "manrope", color: AMBER },
				),
			],
		};
	},
};
