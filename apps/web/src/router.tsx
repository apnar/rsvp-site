import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import Loader from "./components/loader";
import { NotFound, RouteError } from "./components/not-found";
import { routeTree } from "./routeTree.gen";
import { createQueryClient, orpc } from "./utils/orpc";

export const getRouter = () => {
	const queryClient = createQueryClient();

	const router = createTanStackRouter({
		routeTree,
		scrollRestoration: true,
		defaultPreloadStaleTime: 0,
		context: { orpc, queryClient },
		defaultPendingComponent: () => <Loader />,
		// A loader's orNotFound passes the API's own words ("No such event.").
		defaultNotFoundComponent: ({ data }) => (
			<NotFound body={typeof data === "string" ? data : undefined} />
		),
		defaultErrorComponent: RouteError,
	});

	setupRouterSsrQueryIntegration({
		router,
		queryClient,
	});

	return router;
};

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
	interface StaticDataRouteOption {
		/**
		 * The page opens on a full-bleed picture and draws the site header
		 * inside it, so the root leaves its own out. Read from the matches,
		 * which a renamed route cannot silently miss the way a route-id
		 * string could.
		 */
		ownHeader?: boolean;
	}
}
