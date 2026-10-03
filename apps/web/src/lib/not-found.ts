import { ORPCError } from "@orpc/client";
import { notFound } from "@tanstack/react-router";

/**
 * A loader's API "no such event" as the router's not-found. Thrown as an
 * error it rendered the right words but answered HTTP 500, which tells a
 * link checker or a crawler the site is broken; the router's not-found is
 * a 404. The API's wording rides along for the page to show.
 */
export async function orNotFound<T>(load: Promise<T>): Promise<T> {
	try {
		return await load;
	} catch (error) {
		if (error instanceof ORPCError && error.code === "NOT_FOUND") {
			throw notFound({ data: error.message });
		}
		throw error;
	}
}
