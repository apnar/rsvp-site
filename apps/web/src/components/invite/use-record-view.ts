import { useEffect, useRef } from "react";

/**
 * Tell the server, once per visit, that the invitation is on screen. Only
 * the browser does this, after hydrating: link scanners fetch the page's
 * markup without running it, and a tab opened in the background waits
 * until somebody looks at it. Called straight on the client rather than as
 * a mutation, which would refetch every query on screen for a stamp that
 * changes nothing the guest sees; a failure is nobody's business.
 */
export function useRecordView(
	/** The invitation being looked at, or null when nothing should count. */
	key: string | null,
	record: () => Promise<unknown>,
) {
	const sent = useRef<string | null>(null);
	const latest = useRef(record);
	latest.current = record;

	useEffect(() => {
		if (key === null || sent.current === key) return;
		const send = () => {
			if (sent.current === key || document.visibilityState !== "visible") {
				return;
			}
			sent.current = key;
			document.removeEventListener("visibilitychange", send);
			latest.current().catch(() => {});
		};
		send();
		document.addEventListener("visibilitychange", send);
		return () => document.removeEventListener("visibilitychange", send);
	}, [key]);
}
