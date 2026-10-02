import { Toaster } from "@rsvp-site/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { SITE_NAME } from "@/content/run";
import { getUser } from "@/functions/get-user";
import type { orpc } from "@/utils/orpc";

import Header from "../components/header";

import appCss from "../index.css?url";
export interface RouterAppContext {
	orpc: typeof orpc;
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	/**
	 * Every page needs to know whether it is talking to a guest or a
	 * stranger, so the session is read once here and flows down as context.
	 * Runs on each client navigation: one server-function round trip, and no
	 * D1 read while the five-minute cookie cache holds.
	 */
	beforeLoad: async () => ({ session: await getUser() }),

	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: SITE_NAME,
			},
			{
				name: "description",
				content:
					"Invitations and RSVPs for the host's events. In, out or maybe, one click from your inbox.",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
			// An envelope on steel, inside the sheet's registration marks.
			// SVG for browsers that take it, the .ico for the ones that do not
			// (Safari among them), and the 180px PNG for a home screen.
			{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
			{ rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
			{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
		],
	}),

	component: RootDocument,
});

function RootDocument() {
	const { session } = Route.useRouteContext();

	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<div className="flex min-h-svh flex-col">
					<Header />
					<div className="mx-auto w-full max-w-[1100px] flex-1 px-[clamp(20px,5vw,72px)]">
						<main>
							<Outlet />
						</main>
						<footer className="flex flex-wrap justify-between gap-2 border-divider border-t py-12 text-[13px] text-neutral-700 leading-6">
							<span>{SITE_NAME} · invitations from the host</span>
							{session ? (
								<span>
									Rain or shine: the final word on every event lands in your
									inbox on the day.
								</span>
							) : (
								<span>
									Already on the list?{" "}
									<Link to="/login" className="text-steel-700">
										Sign in
									</Link>
									.
								</span>
							)}
						</footer>
					</div>
				</div>
				<Toaster richColors />
				<TanStackRouterDevtools position="bottom-left" />
				<ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
				<Scripts />
			</body>
		</html>
	);
}
