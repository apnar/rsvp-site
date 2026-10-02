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

/** "4h 12m", "42:07", "3d 5h". Tabular by the time it reaches the page. */
export function formatRemaining(ms: number): string {
	if (ms <= 0) return "0:00";
	const total = Math.floor(ms / 1000);
	const days = Math.floor(total / 86400);
	const hours = Math.floor((total % 86400) / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = total % 60;
	if (days > 0) return `${days}d ${hours}h`;
	if (total >= 3600) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * What a screen reader hears. Bucketed on purpose: a live region that speaks
 * every second is a torture device, so this changes at most five times all
 * evening.
 */
export function announceRemaining(ms: number, what: string): string {
	if (ms <= 0) return `${what} has passed.`;
	const minutes = Math.floor(ms / 60_000);
	if (minutes >= 60) {
		const hours = Math.round(minutes / 60);
		return `${hours} hour${hours === 1 ? "" : "s"} to ${what}.`;
	}
	if (minutes >= 30) return `Thirty minutes to ${what}.`;
	if (minutes >= 15) return `Fifteen minutes to ${what}.`;
	if (minutes >= 5) return `Five minutes to ${what}.`;
	if (minutes >= 1) return `One minute to ${what}.`;
	return `Less than a minute to ${what}.`;
}
