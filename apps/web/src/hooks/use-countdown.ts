import { useEffect, useState } from "react";

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
		let timer: ReturnType<typeof setTimeout>;
		const target = targetIso ? Date.parse(targetIso) : null;

		const schedule = () => {
			const t = Date.now();
			const remaining = target === null ? Number.POSITIVE_INFINITY : target - t;
			// Seconds only matter in the last hour. Above that half a minute is
			// plenty, and it does not keep a phone's radio warm for two days.
			const step = remaining > 60 * 60 * 1000 ? 30_000 : 1_000;
			// Align to the boundary so the digits change when they should and
			// the interval cannot drift.
			timer = setTimeout(tick, step - (t % step));
		};
		const tick = () => {
			setNow(Date.now());
			schedule();
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
