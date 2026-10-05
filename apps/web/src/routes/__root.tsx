import { Toaster } from "@rsvp-site/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	Scripts,
	useMatches,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { Wordmark } from "@/components/brand";
import { Container } from "@/components/page";
import SiteHeader from "@/components/site-header";
import { SITE_NAME, TAGLINE } from "@/content/site";
import { getUser } from "@/functions/get-user";

import appCss from "../index.css?url";

/**
 * The browser chrome colour. Mirrors the `night` token in globals.css: a
 * <meta> cannot read a CSS variable, so the value is repeated here once.
 */
const NIGHT = "#14101f";

export interface RouterAppContext {
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
				content: TAGLINE,
			},
			{ name: "theme-color", content: NIGHT },
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
			// The lime dot on plum. SVG for browsers that take it, the .ico for
			// the ones that do not (Safari among them), and the 180px PNG for a
			// home screen.
			{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
			{ rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
			{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
		],
	}),

	component: RootDocument,
});

function RootDocument() {
	const { session } = Route.useRouteContext();
	const matches = useMatches();
	const ownHeader = matches.some((m) => m.staticData.ownHeader);

	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<div className="flex min-h-svh flex-col overflow-x-clip">
					{ownHeader ? null : <SiteHeader />}
					<main className="flex-1">
						<Outlet />
					</main>
					<Container
						as="footer"
						className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-5 pb-8 text-[13px] text-haze"
					>
						<Link to="/" className="mr-auto no-underline">
							<Wordmark className="text-[15px] text-haze" />
						</Link>
						<Link to="/terms" className="text-haze hover:text-ink">
							Terms
						</Link>
						<Link to="/privacy" className="text-haze hover:text-ink">
							Privacy
						</Link>
						{session ? (
							<Link to="/account" className="text-haze hover:text-ink">
								Your account
							</Link>
						) : (
							<Link to="/login" className="text-haze hover:text-ink">
								Sign in
							</Link>
						)}
					</Container>
				</div>
				<Toaster richColors />
				<TanStackRouterDevtools position="bottom-left" />
				<ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
				<Scripts />
			</body>
		</html>
	);
}
