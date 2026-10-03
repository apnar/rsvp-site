import type { Design } from "@rsvp-site/design/schema";
import { type Dispatch, useEffect, useRef } from "react";
import {
	cloneEls,
	duplicateEls,
	type EditorAction,
	type EditorState,
	removeEls,
	restack,
	updateEls,
} from "./editor-state";

function isTyping(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;
	if (!el) return false;
	if (
		el.isContentEditable ||
		el.tagName === "TEXTAREA" ||
		el.tagName === "SELECT"
	) {
		return true;
	}
	// A focused slider, checkbox or swatch shouldn't swallow the shortcuts.
	return (
		el.tagName === "INPUT" &&
		!["range", "checkbox", "color", "button", "file"].includes(
			(el as HTMLInputElement).type,
		)
	);
}

/** The designer's keyboard: undo, copy and paste, nudge, delete, restack. */
export function useKeys(state: EditorState, dispatch: Dispatch<EditorAction>) {
	const clip = useRef<Design["elements"]>([]);
	const latest = useRef(state);
	latest.current = state;
	useEffect(() => {
		const onKey = (ev: KeyboardEvent) => {
			if (isTyping(ev.target)) return;
			const { doc, selected } = latest.current;
			const mod = ev.metaKey || ev.ctrlKey;
			const set = (d: Design, key?: string) =>
				dispatch({ t: "set", doc: d, key, at: Date.now() });
			const movable = doc.elements
				.filter((x) => selected.includes(x.id) && !x.locked)
				.map((x) => x.id);
			if (mod && ev.key.toLowerCase() === "z") {
				dispatch({ t: ev.shiftKey ? "redo" : "undo" });
			} else if (mod && ev.key.toLowerCase() === "y") {
				dispatch({ t: "redo" });
			} else if (mod && ev.key.toLowerCase() === "d" && selected.length) {
				const r = duplicateEls(doc, selected);
				set(r.doc);
				dispatch({ t: "select", ids: r.ids });
			} else if (mod && ev.key.toLowerCase() === "c" && selected.length) {
				clip.current = doc.elements.filter((x) => selected.includes(x.id));
				return;
			} else if (mod && ev.key.toLowerCase() === "v" && clip.current.length) {
				const r = cloneEls(doc, clip.current);
				set(r.doc);
				dispatch({ t: "select", ids: r.ids });
			} else if (
				(ev.key === "Delete" || ev.key === "Backspace") &&
				movable.length
			) {
				set(removeEls(doc, movable));
			} else if (ev.key.startsWith("Arrow") && movable.length) {
				const step = ev.shiftKey ? 10 : 1;
				const dx =
					ev.key === "ArrowLeft" ? -step : ev.key === "ArrowRight" ? step : 0;
				const dy =
					ev.key === "ArrowUp" ? -step : ev.key === "ArrowDown" ? step : 0;
				set(
					updateEls(doc, movable, (x) => ({ ...x, x: x.x + dx, y: x.y + dy })),
					"nudge",
				);
			} else if (
				(ev.code === "BracketRight" || ev.code === "BracketLeft") &&
				selected.length === 1 &&
				selected[0]
			) {
				// `code`, not `key`: Shift turns "]" into "}" and "[" into "{".
				set(
					restack(
						doc,
						selected[0],
						ev.code === "BracketRight"
							? ev.shiftKey
								? "top"
								: "up"
							: ev.shiftKey
								? "bottom"
								: "down",
					),
				);
			} else if (ev.key === "Escape") {
				dispatch({ t: "select", ids: [] });
			} else {
				return;
			}
			ev.preventDefault();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [dispatch]);
}
