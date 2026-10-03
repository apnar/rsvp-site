import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { SimpleCsrfProtectionLinkPlugin } from "@orpc/client/plugins";
import type { RouterClient } from "@orpc/server";
import { createRouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createContext } from "@rsvp-site/api/context";
import { appRouter } from "@rsvp-site/api/routers/index";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { toast } from "sonner";

declare module "@tanstack/react-query" {
	interface Register {
		mutationMeta: { quiet?: boolean };
	}
}

export function createQueryClient() {
	const queryClient: QueryClient = new QueryClient({
		// A write can change what any page shows (a guest count, a stamp), and
		// pages used to refresh only their own namespace while staleTime kept
		// the rest for a minute. Only queries on screen refetch; the rest are
		// marked stale. Not awaited: a write that removes what is on screen (a
		// deleted draft) would otherwise wait on a refetch of the thing it
		// just removed before its own onSuccess could move the page on.
		mutationCache: new MutationCache({
			onSuccess: () => {
				void queryClient.invalidateQueries();
			},
			onError: (error, _vars, _ctx, mutation) => {
				if (mutation.meta?.quiet || mutation.options.onError) return;
				toast.error(error.message);
			},
		}),
		queryCache: new QueryCache({
			onError: (error, query) => {
				// A failed first load already shows the route's error page, and a
				// thing that has just gone (a deleted draft, refetched on the way
				// out) is not news.
				if (query.state.data === undefined) return;
				if (error instanceof ORPCError && error.code === "NOT_FOUND") return;
				toast.error(`Error: ${error.message}`, {
					action: {
						label: "retry",
						onClick: () => {
							query.invalidate();
						},
					},
				});
			},
		}),
		defaultOptions: {
			queries: {
				staleTime: 60 * 1000,
				// A 4xx is the API's answer (not found, not yours), not a blip;
				// asking three more times only delays the error page.
				retry: (failures, error) =>
					!(error instanceof ORPCError && error.status < 500) && failures < 3,
			},
		},
	});
	return queryClient;
}

const getORPCClient = createIsomorphicFn()
	.server(() =>
		createRouterClient(appRouter, {
			context: async () => {
				return createContext({ req: getRequest() });
			},
			// Over HTTP the RPC handler turns an unexpected error into a bare
			// "Internal server error"; called directly during a server render,
			// a D1 or SQL message would go into the page instead. Same rule
			// here: our own errors pass, anything else is logged and masked.
			interceptors: [
				async ({ next }) => {
					try {
						return await next();
					} catch (error) {
						if (error instanceof ORPCError) throw error;
						console.error(error);
						throw new ORPCError("INTERNAL_SERVER_ERROR");
					}
				},
			],
		}),
	)
	.client((): RouterClient<typeof appRouter> => {
		const link = new RPCLink({
			url: `${window.location.origin}/api/rpc`,
			// The header the handler insists on: a page on another botch.com
			// site counts as same-site and gets our cookies, but can't set it.
			plugins: [new SimpleCsrfProtectionLinkPlugin()],
			fetch(url, options) {
				return fetch(url, {
					...options,
					credentials: "include",
				});
			},
		});

		return createORPCClient(link);
	});

export const client: RouterClient<typeof appRouter> = getORPCClient();

export const orpc = createTanstackQueryUtils(client);
