import { Button } from "@rsvp-site/ui/components/button";
import type { useDesignSave } from "./use-design-save";

type Save = ReturnType<typeof useDesignSave>;

/** The bar across the top while the router holds a navigation for unsaved changes. */
export function UnsavedBar({
	blocker,
	saving,
	onSaveAndLeave,
}: Pick<Save, "blocker" | "saving"> & { onSaveAndLeave: () => void }) {
	if (blocker.status !== "blocked") return null;
	return (
		<div className="flex flex-wrap items-center gap-3 border-pink border-b bg-pink/14 px-4 py-2.5 text-[14px]">
			<span className="mr-auto">You have changes that aren't saved.</span>
			<Button size="sm" variant="ghost" onClick={blocker.proceed}>
				Leave without saving
			</Button>
			<Button size="sm" variant="light" onClick={blocker.reset}>
				Stay
			</Button>
			<Button size="sm" disabled={saving} onClick={onSaveAndLeave}>
				Save and leave
			</Button>
		</div>
	);
}
