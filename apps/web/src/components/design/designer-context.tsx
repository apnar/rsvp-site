import { createContext, useContext } from "react";
import type { ImageTray, SetDoc } from "./editor-state";

/**
 * What every side panel needs and none of them changes: how to write the
 * document, whether the event is paper, the image tray. The document itself
 * is not here: it changes on every drag step, and each panel takes it as a
 * prop so it is plain which ones follow it.
 */
type DesignerContextValue = {
	set: SetDoc;
	paper: boolean;
	tray: ImageTray;
};

export const DesignerContext = createContext<DesignerContextValue | null>(null);

export function useDesigner(): DesignerContextValue {
	const ctx = useContext(DesignerContext);
	if (!ctx) throw new Error("useDesigner needs a DesignerContext");
	return ctx;
}
