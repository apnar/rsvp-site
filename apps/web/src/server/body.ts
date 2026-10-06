/** Far more than a webhook event is; refuses a body meant to tie up the Worker. */
export const MAX_WEBHOOK_BODY = 64 * 1024;

/**
 * The request's body as text, or null when it is over `max` bytes. The
 * declared length is checked first, so an honest oversize is refused
 * unread; the count while reading catches a body that lied about it or
 * has no length at all (chunked). Both webhooks call this before they look
 * at a signature, so it is the unsigned caller's cost that is bounded.
 */
export async function readCapped(
	request: Request,
	max = MAX_WEBHOOK_BODY,
): Promise<string | null> {
	const declared = Number(request.headers.get("content-length"));
	if (declared > max) return null;
	if (!request.body) return "";
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > max) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	let at = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, at);
		at += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
}
