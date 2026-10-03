import type { Faces } from "@rsvp-site/design/faces";
import type { Values } from "@rsvp-site/design/placeholders";
import type { Design } from "@rsvp-site/design/schema";
import {
	fromTemplate,
	type Placed,
	type Template,
	type TemplateContext,
} from "@rsvp-site/design/templates/index";
import { Button } from "@rsvp-site/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Container } from "@/components/page";
import { designSrc } from "@/lib/design-src";
import { messageOf } from "@/lib/errors";
import { naturalSize } from "@/lib/shrink-image";
import { client } from "@/utils/orpc";
import { TemplatePicker } from "./template-picker";
import { TopBar } from "./top-bar";

/** The designer's first screen, and "Start over": a template to begin from. */
export function PickTemplate({
	eventId,
	title,
	coverKey,
	paper,
	faces,
	values,
	canCancel,
	onCancel,
	onPick,
	copied,
}: {
	eventId: string;
	title: string;
	coverKey: string | null;
	paper: boolean;
	faces: Faces;
	values: Values;
	canCancel: boolean;
	onCancel: () => void;
	onPick: (d: Design) => void;
	/**
	 * A template's pictures, once copied into this event, by
	 * "<template>/<name>": picking it again in the same visit reuses them
	 * (and the server would hand back the same ones anyway).
	 */
	copied: Map<string, Placed>;
}) {
	const [ctx, setCtx] = useState<TemplateContext | null>(
		coverKey ? null : { cover: null, paper },
	);
	const [preparing, setPreparing] = useState<string | null>(null);
	const pick = async (t: Template) => {
		if (!ctx) return;
		if (!t.assets) {
			onPick(fromTemplate(t, ctx));
			return;
		}
		setPreparing(t.id);
		try {
			const assets: Record<string, Placed> = {};
			for (const [name, a] of Object.entries(t.assets)) {
				const key = `${t.id}/${name}`;
				let placed = copied.get(key);
				if (!placed) {
					// The template's own pictures become this event's, like any
					// upload, so the design names only images the event holds.
					const blob = await (
						await fetch(`/templates/${t.id}/${a.file}`)
					).blob();
					const file = new File([blob], a.file, { type: blob.type });
					const { ref } = await client.designs.uploadImage({ eventId, file });
					placed = { ref, iw: a.iw, ih: a.ih };
					copied.set(key, placed);
				}
				assets[name] = placed;
			}
			onPick(fromTemplate(t, { ...ctx, assets }));
		} catch (error) {
			toast.error(messageOf(error) || "That template's pictures didn't load.");
		} finally {
			setPreparing(null);
		}
	};
	// The cover is copied into the design's own images, so templates can
	// show it and replacing the cover later can't pull it out of the card.
	// A copy is a write, so it is a mutation, started once per cover: the
	// guard is a ref because StrictMode runs an effect twice and a second
	// copy would upload a second picture.
	const copyCover = useMutation({
		mutationFn: async () => {
			try {
				const { ref } = await client.designs.copyCover({ eventId });
				if (!ref) return null;
				const { width, height } = await naturalSize(designSrc(ref));
				return { ref, iw: width, ih: height };
			} catch {
				// No cover to show on the templates is better than no templates.
				return null;
			}
		},
		onSuccess: (cover) => setCtx({ cover, paper }),
	});
	const copiedFor = useRef<string | null>(null);
	useEffect(() => {
		if (!coverKey || copiedFor.current === `${eventId}/${coverKey}`) return;
		copiedFor.current = `${eventId}/${coverKey}`;
		copyCover.mutate();
	}, [coverKey, eventId, copyCover.mutate]);
	return (
		<>
			<TopBar eventId={eventId} title={title}>
				{canCancel ? (
					<Button variant="ghost" size="sm" onClick={onCancel}>
						Back to my design
					</Button>
				) : null}
			</TopBar>
			<Container className="flex flex-col gap-5 py-8">
				<div>
					<h1 className="m-0 text-[clamp(26px,4vw,40px)]">
						Pick a starting point
					</h1>
					<p className="m-0 mt-1 text-soft">
						Everything on it can be changed. The words in braces fill in from
						your event.
					</p>
				</div>
				{preparing ? (
					<p className="m-0 text-haze">Bringing in the template's pictures…</p>
				) : null}
				{ctx ? (
					<TemplatePicker
						ctx={ctx}
						faces={faces}
						values={values}
						onPick={(t) => {
							if (!preparing) void pick(t);
						}}
					/>
				) : (
					<p className="text-haze">Fetching your cover photo…</p>
				)}
			</Container>
		</>
	);
}
