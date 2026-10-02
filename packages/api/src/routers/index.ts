import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import { accountRouter } from "./account";
import { contactsRouter } from "./contacts";
import { eventsRouter } from "./events";
import { guestsRouter } from "./guests";
import { mailRouter } from "./mail";
import { peopleRouter } from "./people";

export const appRouter = {
	healthCheck: publicProcedure.handler(() => {
		return "OK";
	}),
	account: accountRouter,
	events: eventsRouter,
	guests: guestsRouter,
	contacts: contactsRouter,
	people: peopleRouter,
	mail: mailRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
