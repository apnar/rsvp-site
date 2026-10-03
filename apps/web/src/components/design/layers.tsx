import type { Design } from "@rsvp-site/design/schema";
import { Button } from "@rsvp-site/ui/components/button";
import { cn } from "@rsvp-site/ui/lib/utils";
import {
	ChevronDown,
	ChevronUp,
	Eye,
	EyeOff,
	Lock,
	LockOpen,
} from "lucide-react";
import { elementLabel, patchEl, restack } from "./editor-state";
import type { SetDoc } from "./inspector";

/** The stack, top first: pick, reorder, lock and hide. */
export function Layers({
	doc,
	selected,
	onSelect,
	set,
}: {
	doc: Design;
	selected: string[];
	onSelect: (ids: string[], add: boolean) => void;
	set: SetDoc;
}) {
	const top = doc.elements.length - 1;
	return (
		<ol className="m-0 flex list-none flex-col gap-0.5 p-0">
			{[...doc.elements].reverse().map((el, ri) => {
				const i = top - ri;
				const on = selected.includes(el.id);
				return (
					<li
						key={el.id}
						className={cn(
							"flex items-center gap-1 rounded-[10px] pl-2.5",
							on ? "bg-panel-2" : "hover:bg-panel-2/60",
						)}
					>
						<button
							type="button"
							onClick={(e) => onSelect([el.id], e.shiftKey)}
							className={cn(
								"min-w-0 flex-1 cursor-pointer truncate border-0 bg-transparent py-1.5 text-left text-[13px]",
								el.hidden ? "text-haze line-through" : "text-ink",
							)}
						>
							{elementLabel(el)}
						</button>
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label="Bring forward"
							disabled={i === top}
							onClick={() => set(restack(doc, el.id, "up"))}
						>
							<ChevronUp />
						</Button>
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label="Send backward"
							disabled={i === 0}
							onClick={() => set(restack(doc, el.id, "down"))}
						>
							<ChevronDown />
						</Button>
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label={el.locked ? "Unlock" : "Lock"}
							onClick={() => set(patchEl(doc, el.id, { locked: !el.locked }))}
						>
							{el.locked ? <Lock /> : <LockOpen className="opacity-40" />}
						</Button>
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label={el.hidden ? "Show" : "Hide"}
							onClick={() => set(patchEl(doc, el.id, { hidden: !el.hidden }))}
						>
							{el.hidden ? <EyeOff /> : <Eye className="opacity-40" />}
						</Button>
					</li>
				);
			})}
		</ol>
	);
}
