import { ORPCError } from "@orpc/server";
import { normalizeEmail } from "@rsvp-site/db/addresses";
import {
	findOrCreatePeople,
	findReachablePersonByEmail,
	markLinkSent,
} from "@rsvp-site/db/people";
import { user } from "@rsvp-site/db/schema/auth";
import { event, eventGuest } from "@rsvp-site/db/schema/event";
import { newToken } from "@rsvp-site/db/tokens";
import { joinLinkEmail, mediaUrl } from "@rsvp-site/email";
import { getMailer, siteUrl } from "@rsvp-site/email/worker";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { findEventByShareToken, labelsOf, notFound } from "../../events";
import { withHostEvent } from "../../host-event";
import { hostProcedure, personProcedure, publicProcedure } from "../../index";
import { emailSchema, idInput } from "../../inputs";
import { lookOf, signInUrl } from "../../mail";

/** How long before somebody can ask a share link for another email. */
const JOIN_COOLDOWN_MS = 2 * 60 * 1000;

export const shareRouter = {
	/** What a share link shows before anybody signs in: the outside of the envelope. */
	teaser: publicProcedure
		.input(z.object({ token: z.string().min(1).max(64) }))
		.handler(async ({ context, input }) => {
			const row = await findEventByShareToken(context.db, input.token);
			if (!row?.shareEnabled || row.status === "draft") throw notFound();
			const design =
				row.designOn && row.theme && row.cardKey
					? { theme: row.theme, cardKey: row.cardKey }
					: null;
			const image = design ? design.cardKey : row.coverKey;
			return {
				eventId: row.id,
				title: row.title,
				hostLine: row.hostLine,
				coverKey: row.coverKey,
				status: row.status,
				...labelsOf(row),
				// The card the host designed, as its picture: the share page is
				// public, and the full card is laid out only for people on the list.
				design,
				/** For link previews in chat apps, which need an absolute URL. */
				imageUrl: image ? mediaUrl(siteUrl(), image) : null,
			};
		}),

	/**
	 * A stranger on a share link types their address. Says the same thing
	 * whatever happens -- new person, known person, deactivated, too soon --
	 * so the form cannot be used to learn who is on the site. Rate-limited by
	 * address (the cooldown) and by IP (the Workers rate limiter), so it
	 * cannot be turned into a way to mail strangers.
	 */
	join: publicProcedure
		.input(
			z.object({
				token: z.string().min(1).max(64),
				email: emailSchema,
			}),
		)
		.handler(async ({ context, input }) => {
			const row = await findEventByShareToken(context.db, input.token);
			if (!row?.shareEnabled || row.status !== "published") {
				throw notFound();
			}
			const ip = context.headers.get("cf-connecting-ip") ?? "local";
			const { success } = await context.env.JOIN_LIMITER.limit({ key: ip });
			if (!success) {
				throw new ORPCError("TOO_MANY_REQUESTS", {
					message: "Too many tries. Wait a minute and try again.",
				});
			}
			const email = normalizeEmail(input.email);
			const existing = await findReachablePersonByEmail(context.db, email);
			if (
				existing?.linkSentAt &&
				Date.now() - existing.linkSentAt.getTime() < JOIN_COOLDOWN_MS
			) {
				return { ok: true };
			}
			const [person] = await findOrCreatePeople(context.db, [email], "link");
			if (!person || person.status === "deactivated") return { ok: true };
			const token = await context.db
				.select({ linkToken: user.linkToken })
				.from(user)
				.where(eq(user.id, person.id))
				.get();
			if (!token?.linkToken) return { ok: true };
			const outcome = await getMailer().sendOne(
				{ email: person.email, name: null },
				joinLinkEmail({
					title: row.title,
					url: signInUrl(token.linkToken, `/i/${row.shareToken}`),
					coverUrl: row.coverKey ? mediaUrl(siteUrl(), row.coverKey) : null,
					look: lookOf(row),
				}),
				{ tags: ["join_link"] },
			);
			if (outcome.ok) await markLinkSent(context.db, person.id);
			return { ok: true };
		}),

	/**
	 * Signed in on a share link: put the caller on the list. They clicked a
	 * link in their own inbox to get here, so they count as invited and get
	 * no invitation email on top.
	 */
	claimJoin: personProcedure
		.input(z.object({ token: z.string().min(1).max(64) }))
		.handler(async ({ context, input }) => {
			const row = await findEventByShareToken(context.db, input.token);
			if (!row?.shareEnabled || row.status !== "published") throw notFound();
			await context.db
				.insert(eventGuest)
				.values({
					id: crypto.randomUUID(),
					eventId: row.id,
					userId: context.me.id,
					source: "link",
					invitedAt: new Date(),
				})
				.onConflictDoNothing();
			return { eventId: row.id };
		}),

	/** Retire the share link and make a new one. Invitations are unaffected. */
	resetShareLink: hostProcedure
		.input(idInput)
		.use(withHostEvent)
		.handler(async ({ context }) => {
			const row = context.event;
			const token = newToken();
			await context.db
				.update(event)
				.set({ shareToken: token })
				.where(eq(event.id, row.id));
			return { shareUrl: `${siteUrl()}/i/${token}` };
		}),
};
