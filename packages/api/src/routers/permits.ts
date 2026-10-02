import { ORPCError } from "@orpc/server";
import { game } from "@rsvp-site/db/schema/game";
import { gym } from "@rsvp-site/db/schema/gym";
import { permit, permitGym } from "@rsvp-site/db/schema/permit";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type { Context } from "../context";
import { adminProcedure } from "../index";
import { formatGameDate } from "../run";

const MAX_PERMIT_BYTES = 10 * 1024 * 1024;

/** The venues a permit covers. Empty is allowed: paperwork turns up first. */
const gymIdsSchema = z.array(z.string().min(1)).max(50).optional();

/**
 * Replace a permit's coverage. Delete-then-insert rather than a diff: the set
 * is at most a handful of rows and this way the table always matches what the
 * admin ticked, with no leftovers from a gym that has since been unticked.
 */
async function setCoverage(
	db: Context["db"],
	permitId: string,
	gymIds: string[],
) {
	await db.delete(permitGym).where(eq(permitGym.permitId, permitId));
	const unique = [...new Set(gymIds)];
	if (unique.length === 0) return;
	const known = await db
		.select({ id: gym.id })
		.from(gym)
		.where(inArray(gym.id, unique))
		.all();
	if (known.length !== unique.length) {
		throw new ORPCError("NOT_FOUND", {
			message: "One of those venues is gone. Reload and try again.",
		});
	}
	await db
		.insert(permitGym)
		.values(unique.map((gymId) => ({ permitId, gymId })));
}

export const permitsRouter = {
	/** Every permit with the gyms it covers and the games that reference it. */
	list: adminProcedure.handler(async ({ context }) => {
		const permits = await context.db
			.select()
			.from(permit)
			.orderBy(desc(permit.createdAt))
			.all();
		const games = await context.db
			.select({ id: game.id, date: game.date, permitId: game.permitId })
			.from(game)
			.orderBy(asc(game.date))
			.all();
		const coverage = await context.db
			.select({
				permitId: permitGym.permitId,
				id: gym.id,
				name: gym.name,
			})
			.from(permitGym)
			.innerJoin(gym, eq(permitGym.gymId, gym.id))
			.orderBy(asc(gym.name))
			.all();
		return permits.map((p) => ({
			id: p.id,
			label: p.label,
			fileName: p.fileName,
			size: p.size,
			createdAt: p.createdAt,
			gyms: coverage
				.filter((c) => c.permitId === p.id)
				.map(({ permitId: _permitId, ...g }) => g),
			games: games
				.filter((g) => g.permitId === p.id)
				.map((g) => ({
					id: g.id,
					date: g.date,
					dateLabel: formatGameDate(g.date),
				})),
		}));
	}),

	/** Store a PDF in R2 and record it. */
	upload: adminProcedure
		.input(
			z.object({
				label: z.string().trim().min(1, "Give it a label.").max(80),
				/** Which venues this one piece of paper covers. */
				gymIds: gymIdsSchema,
				file: z
					.file()
					.max(MAX_PERMIT_BYTES, "Permits over 10 MB are not permits.")
					.mime(["application/pdf"], "Only PDF permits, please."),
			}),
		)
		.handler(async ({ context, input }) => {
			const id = crypto.randomUUID();
			const r2Key = `permits/${id}.pdf`;
			const fileName = input.file.name || `${input.label}.pdf`;
			await context.env.PERMITS.put(r2Key, input.file, {
				httpMetadata: { contentType: "application/pdf" },
				customMetadata: { fileName, label: input.label },
			});
			await context.db.insert(permit).values({
				id,
				label: input.label,
				r2Key,
				fileName,
				contentType: "application/pdf",
				size: input.file.size,
				uploadedBy: context.session.user.id,
			});
			await setCoverage(context.db, id, input.gymIds ?? []);
			return { id, label: input.label, fileName, size: input.file.size };
		}),

	/** Retick which venues a permit covers, without re-uploading the PDF. */
	setGyms: adminProcedure
		.input(
			z.object({
				id: z.string().min(1),
				gymIds: z.array(z.string().min(1)).max(50),
			}),
		)
		.handler(async ({ context, input }) => {
			const row = await context.db
				.select({ id: permit.id })
				.from(permit)
				.where(eq(permit.id, input.id))
				.get();
			if (!row) {
				throw new ORPCError("NOT_FOUND", { message: "No such permit." });
			}
			await setCoverage(context.db, input.id, input.gymIds);
			return { ok: true };
		}),

	/** Delete the file and the record. Games that used it keep playing, unpermitted. */
	remove: adminProcedure
		.input(z.object({ id: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const row = await context.db
				.select({ id: permit.id, r2Key: permit.r2Key })
				.from(permit)
				.where(eq(permit.id, input.id))
				.get();
			if (!row) {
				throw new ORPCError("NOT_FOUND", { message: "No such permit." });
			}
			await context.env.PERMITS.delete(row.r2Key);
			await context.db.delete(permit).where(eq(permit.id, row.id));
			return { ok: true };
		}),
};
