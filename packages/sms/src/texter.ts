import { segments } from "./segments";
import { postMessage, type TextOutcome, textRequest } from "./telnyx";

export type OutgoingText = {
	to: string;
	text: string;
	mediaUrl?: string | null;
};

export type Texter = {
	dryRun: boolean;
	send(m: OutgoingText): Promise<TextOutcome>;
	/** Outcomes in the order of `ms`, at most `concurrency` in flight. */
	sendMany(
		ms: readonly OutgoingText[],
		concurrency?: number,
	): Promise<TextOutcome[]>;
};

export function createTexter(opts: {
	apiKey?: string;
	from: string;
	allowDryRun: boolean;
	fetch?: typeof fetch;
	log?: (line: string) => void;
}): Texter {
	const dryRun = !opts.apiKey && opts.allowDryRun;
	const log = opts.log ?? ((line: string) => console.log(line));

	async function send(m: OutgoingText): Promise<TextOutcome> {
		if (dryRun) {
			// Only ever on localhost (allowDryRun), so the sign-in link in the
			// text is safe to print and is clickable from the dev console.
			log(
				`[dry-run text] to ${m.to}: ${m.text}${m.mediaUrl ? ` (picture: ${m.mediaUrl})` : ""}`,
			);
			return {
				ok: true,
				id: `dry-run-${crypto.randomUUID()}`,
				parts: segments(m.text).parts,
			};
		}
		if (!opts.apiKey) {
			return {
				ok: false,
				status: 0,
				code: null,
				error: "Texting is not configured.",
			};
		}
		return postMessage(textRequest({ from: opts.from, ...m }), {
			apiKey: opts.apiKey,
			fetch: opts.fetch,
		});
	}

	async function sendMany(
		ms: readonly OutgoingText[],
		concurrency = 6,
	): Promise<TextOutcome[]> {
		const out: TextOutcome[] = new Array(ms.length);
		let next = 0;
		const worker = async () => {
			while (next < ms.length) {
				const i = next++;
				const m = ms[i];
				if (m) out[i] = await send(m);
			}
		};
		await Promise.all(
			Array.from(
				{ length: Math.max(1, Math.min(concurrency, ms.length)) },
				worker,
			),
		);
		return out;
	}

	return { dryRun, send, sendMany };
}
