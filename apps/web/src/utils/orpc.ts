import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { SimpleCsrfProtectionLinkPlugin } from "@orpc/client/plugins";
import type { RouterClient } from "@orpc/server";
import { createRouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createContext } from "@rsvp-site/api/context";
import { appRouter } from "@rsvp-site/api/routers/index";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { toast } from "sonner";

export function createQueryClient() {
	return new QueryClient({
		queryCache: new QueryCache({
			onError: (error, query) => {
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
		defaultOptions: { queries: { staleTime: 60 * 1000 } },
	});
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
