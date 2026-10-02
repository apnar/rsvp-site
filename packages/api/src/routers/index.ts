import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import { accountRouter } from "./account";
import { contributionsRouter } from "./contributions";
import { gamesRouter } from "./games";
import { gymsRouter } from "./gyms";
import { mailRouter } from "./mail";
import { peopleRouter } from "./people";
import { permitsRouter } from "./permits";
import { rsvpRouter } from "./rsvp";

export const appRouter = {
	healthCheck: publicProcedure.handler(() => {
		return "OK";
	}),
	account: accountRouter,
	games: gamesRouter,
	gyms: gymsRouter,
	permits: permitsRouter,
	rsvp: rsvpRouter,
	people: peopleRouter,
	mail: mailRouter,
	contributions: contributionsRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
