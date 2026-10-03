import { accountRouter } from "./account";
import { contactsRouter } from "./contacts";
import { designsRouter } from "./designs";
import { eventsRouter } from "./events";
import { guestsRouter } from "./guests";
import { mailRouter } from "./mail";
import { paperRouter } from "./paper";
import { peopleRouter } from "./people";

export const appRouter = {
	account: accountRouter,
	events: eventsRouter,
	designs: designsRouter,
	guests: guestsRouter,
	contacts: contactsRouter,
	people: peopleRouter,
	mail: mailRouter,
	paper: paperRouter,
};
export type AppRouter = typeof appRouter;
