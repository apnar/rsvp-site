import { Button } from "@rsvp-site/ui/components/button";
import { cn } from "@rsvp-site/ui/lib/utils";

/** The part of the router's blocker the bar reads. */
type Blocker = {
	status: string;
	proceed?: () => void;
	reset?: () => void;
};

/**
 * The bar shown while the router holds a navigation for unsaved changes:
 * across the top in the designer, boxed in the event editor (`className`).
 */
export function UnsavedBar({
	blocker,
	saving,
	onSaveAndLeave,
	className,
}: {
	blocker: Blocker;
	saving: boolean;
	onSaveAndLeave: () => void;
	className?: string;
}) {
	if (blocker.status !== "blocked") return null;
	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-3 border-pink border-b bg-pink/14 px-4 py-2.5 text-[14px]",
				className,
			)}
		>
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
