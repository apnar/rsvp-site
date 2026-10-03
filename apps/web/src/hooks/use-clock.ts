import { useEffect, useState } from "react";

import { nextTickDelay } from "@/lib/countdown";

/**
 * A clock that starts where the server left it.
 *
 * This app server-renders. Calling `Date.now()` during render would give the
 * server one number and the browser another, and React would keep whichever
 * it felt like -- so the seed is the instant the payload was built, which is
 * inside the query data serialized into the HTML. Server render and the first
 * client render therefore produce identical text, and the clock only starts
 * moving in an effect, which never runs on the server.
 *
 * `suppressHydrationWarning` is not the answer to that problem: it hides the
 * warning and keeps the mismatch.
 */
export function useClock(serverNowIso: string, targetIso: string | null) {
	const [now, setNow] = useState(() => Date.parse(serverNowIso));

	useEffect(() => {
		// With no start time nothing on screen depends on the clock.
		if (!targetIso) return;
		const target = Date.parse(targetIso);
		let timer: ReturnType<typeof setTimeout> | undefined;

		const tick = () => {
			const t = Date.now();
			setNow(t);
			const delay = nextTickDelay(target - t);
			timer = delay === null ? undefined : setTimeout(tick, delay);
		};

		tick();
		// A phone out of a pocket should be right in the first frame, not on
		// the next tick.
		const resync = () => {
			if (!document.hidden) {
				clearTimeout(timer);
				tick();
			}
		};
		document.addEventListener("visibilitychange", resync);
		window.addEventListener("focus", resync);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("visibilitychange", resync);
			window.removeEventListener("focus", resync);
		};
	}, [targetIso]);

	return now;
}
