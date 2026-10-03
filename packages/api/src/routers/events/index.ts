import { coverRouter } from "./cover";
import { dashboardRouter } from "./dashboard";
import { editorRouter } from "./editor";
import { paperRouter } from "./paper";
import { sendingRouter } from "./sending";
import { shareRouter } from "./share";

// One flat `events.*` namespace, split by concern only for the reader.
export const eventsRouter = {
	...dashboardRouter,
	...editorRouter,
	...coverRouter,
	...sendingRouter,
	...paperRouter,
	...shareRouter,
};
