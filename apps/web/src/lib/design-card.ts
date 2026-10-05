/**
 * Keeping the card image current. The image bakes in the event's facts, so
 * it is drawn again after the design is saved, after the facts change in
 * the event editor, and -- as a backstop -- whenever a host's page finds
 * the stored one was drawn from something else.
 */
import { client } from "@/utils/orpc";

export async function refreshCard(
	eventId: string,
	onlyIfStale = false,
): Promise<void> {
	if (import.meta.env.SSR) return;
	const inputs = await client.designs.cardInputs({ eventId });
	if (!inputs || (onlyIfStale && !inputs.stale)) return;
	const { renderCard } = await import("./design-canvas");
	const { blob, mms } = await renderCard(inputs.doc, inputs.values);
	await client.designs.uploadCard({
		eventId,
		card: new File([blob], "card.jpg", { type: "image/jpeg" }),
		...(mms
			? { mms: new File([mms], "card-mms.jpg", { type: "image/jpeg" }) }
			: {}),
		basis: inputs.basis,
	});
}
