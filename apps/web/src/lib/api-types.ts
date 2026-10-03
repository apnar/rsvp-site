import type { InferRouterInputs, InferRouterOutputs } from "@orpc/server";
import type { AppRouter } from "@rsvp-site/api/routers/index";

/** What each procedure returns, for typing props of page components. */
export type Outputs = InferRouterOutputs<AppRouter>;

/** What each procedure accepts, so a form's shape follows the API's schema. */
export type Inputs = InferRouterInputs<AppRouter>;
