import type { Faces } from "@rsvp-site/design/faces";
import { SAMPLE_VALUES, type Values } from "@rsvp-site/design/placeholders";
import { layoutCard } from "@rsvp-site/design/scene";
import {
	fromTemplate,
	TEMPLATES,
	type Template,
	type TemplateContext,
} from "@rsvp-site/design/templates/index";
import { CardSvg } from "./card-svg";

/** Starting points, each drawn live with the event's own facts. */
export function TemplatePicker({
	ctx,
	faces,
	values,
	onPick,
}: {
	ctx: TemplateContext;
	faces: Faces;
	values: Values;
	onPick: (t: Template) => void;
}) {
	return (
		<div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-5">
			{TEMPLATES.map((t) => {
				const d = fromTemplate(t, ctx);
				const scene = layoutCard(d, {
					values: { ...SAMPLE_VALUES, ...values },
					mode: ctx.paper ? "paper" : "web",
					faces,
				});
				return (
					<button
						key={t.id}
						type="button"
						onClick={() => onPick(t)}
						className="group flex cursor-pointer flex-col gap-2 border-0 bg-transparent p-0 text-left text-ink"
					>
						<CardSvg
							scene={scene}
							label={`The ${t.label} template`}
							className="block h-auto w-full rounded-[6px] shadow-float outline-2 outline-transparent outline-offset-4 group-hover:outline-lime"
						/>
						<span className="font-bold text-[14px]">{t.label}</span>
					</button>
				);
			})}
		</div>
	);
}
