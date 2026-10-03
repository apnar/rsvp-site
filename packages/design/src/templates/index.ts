import { type Design, design } from "../schema";
import { afterDark } from "./after-dark";
import type { Template, TemplateContext } from "./types";

export type { Template, TemplateContext } from "./types";

export const TEMPLATES: Template[] = [afterDark];

/** A template made into a design, parsed so its defaults are filled in. */
export function fromTemplate(t: Template, ctx: TemplateContext): Design {
	return design.parse(t.build(ctx));
}
