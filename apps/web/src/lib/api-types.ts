import type { InferRouterOutputs } from "@orpc/server";
import type { AppRouter } from "@rsvp-site/api/routers/index";

/** What each procedure returns, for typing props of page components. */
export type Outputs = InferRouterOutputs<AppRouter>;
