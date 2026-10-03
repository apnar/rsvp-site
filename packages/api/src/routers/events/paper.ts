import { ORPCError } from "@orpc/server";
import { user } from "@rsvp-site/db/schema/auth";
import { eventGuest } from "@rsvp-site/db/schema/event";
import { siteUrl } from "@rsvp-site/email/worker";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { csvCell } from "../../event-rules";
import {
	designedDoc,
	designValues,
	guestsOf,
	labelsOf,
	potluckOf,
} from "../../events";
import { withHostEvent } from "../../host-event";
import { hostProcedure } from "../../index";
import { idInput, idSchema } from "../../inputs";

export const paperRouter = {
	/**
	 * Everything the host's browser needs to print paper invitations: the
	 * event, and a QR key per guest, issued on first print and kept after, so
	 * printing again never breaks a card already in somebody's mailbox.
	 * (`guests.newPaperCode` replaces one guest's key on purpose.)
	 *
	 * The keys go to the host by design -- they are printed -- which is why
	 * they are per invitation and sign in plain guests only.
	 */
	paperInvites: hostProcedure
		.input(idInput.extend({ guestIds: z.array(idSchema).max(1000).optional() }))
		.use(withHostEvent)
		.handler(async ({ context, input }) => {
			const row = context.event;
			if (!row.paper) {
				throw new ORPCError("BAD_REQUEST", {
					message: "This event is sent by email, not on paper.",
				});
			}
			// One statement for the whole list, and each row draws its own bytes.
			// Same shape as `newToken()`: 32 lower-case hex characters. The IS NULL
			// guard keeps a key already on a card in somebody's mailbox.
			await context.db
				.update(eventGuest)
				.set({ paperToken: sql`lower(hex(randomblob(16)))` })
				.where(
					and(eq(eventGuest.eventId, row.id), isNull(eventGuest.paperToken)),
				);
			const wanted = input.guestIds ? new Set(input.guestIds) : null;
			const rows = await context.db
				.select({
					id: eventGuest.id,
					name: user.name,
					token: eventGuest.paperToken,
				})
				.from(eventGuest)
				.innerJoin(user, eq(user.id, eventGuest.userId))
				.where(eq(eventGuest.eventId, row.id))
				.orderBy(asc(user.name))
				.all();
			const design = await designedDoc(context.db, row);
			return {
				// Laid out in the browser, which has the time and the fonts.
				design,
				values: designValues(row, ""),
				event: {
					title: row.title,
					hostLine: row.hostLine,
					location: row.location,
					details: row.details,
					coverKey: row.coverKey,
					...labelsOf(row),
				},
				guests: rows.flatMap((r) =>
					(!wanted || wanted.has(r.id)) && r.token
						? [
								{
									id: r.id,
									name: r.name,
									url: `${siteUrl()}/p/${r.token}`,
								},
							]
						: [],
				),
			};
		}),

	/** The guest list as CSV, for a spreadsheet or a caterer. */
	exportCsv: hostProcedure
		.input(idInput)
		.use(withHostEvent)
		.handler(async ({ context }) => {
			const row = context.event;
			const [guests, potluck] = await Promise.all([
				guestsOf(context.db, row.id),
				potluckOf(context.db, row.id),
			]);
			const bringing = (guestId: string) =>
				(potluck.byGuest.get(guestId) ?? []).map((c) => c.label).join("; ");
			const header = [
				"Name",
				"Email",
				"Answer",
				"Adults",
				"Kids",
				"Dietary",
				"Note",
				"Bringing",
				"Answered",
				"Added by",
			];
			const lines = guests.map((g) => [
				g.name,
				g.email,
				g.response ?? "no reply",
				g.response === "yes" ? String(g.adults) : "",
				g.response === "yes" ? String(g.kids) : "",
				g.dietary,
				g.note,
				bringing(g.id),
				g.respondedAt ? g.respondedAt.toISOString() : "",
				g.source === "guest"
					? (g.addedByName ?? "a guest")
					: g.source === "link"
						? "share link"
						: "host",
			]);
			const csv = [header, ...lines]
				.map((cells) => cells.map(csvCell).join(","))
				.join("\r\n");
			return {
				fileName: `${row.title.replace(/[^\w\- ]+/g, "").trim() || "guests"}.csv`,
				csv,
			};
		}),
};
