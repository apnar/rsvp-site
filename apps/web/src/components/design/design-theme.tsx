import type { FaceKey } from "@rsvp-site/design/fonts";
import type { Scene } from "@rsvp-site/design/scene";
import type { DesignTheme as Theme } from "@rsvp-site/design/schema";
import { themeCss } from "@rsvp-site/design/theme";
import { facesOfFont, fontFaceCss } from "@/lib/design-font-css";

/**
 * The event's own colours and fonts for the whole page, portals included:
 * a :root rule over the After Dark tokens, rendered with the page so the
 * first paint is already themed. It goes when the page does.
 *
 * Only parsed values reach this CSS (hex colours, registry font names),
 * which is what makes the raw <style> safe.
 */
export function DesignTheme({ theme, scene }: { theme: Theme; scene?: Scene }) {
	const faces = new Set<FaceKey>([
		...facesOfFont(theme.headingFont),
		...facesOfFont(theme.bodyFont),
	]);
	for (const n of scene?.nodes ?? []) if (n.k === "text") faces.add(n.face);
	return (
		<style
			// biome-ignore lint/security/noDangerouslySetInnerHtml: built only from validated values (see above)
			dangerouslySetInnerHTML={{ __html: fontFaceCss(faces) + themeCss(theme) }}
		/>
	);
}
