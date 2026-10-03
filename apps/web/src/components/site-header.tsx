import { canHost, isAdmin } from "@rsvp-site/db/roles";
import { buttonVariants } from "@rsvp-site/ui/components/button";
import { cn } from "@rsvp-site/ui/lib/utils";
import { Link, useRouteContext } from "@tanstack/react-router";

import { Wordmark } from "./brand";
import { Container } from "./page";
import UserMenu from "./user-menu";

const linkClass =
	"text-[13px] sm:text-[14px] font-medium whitespace-nowrap text-ink no-underline hover:text-lime-ink aria-[current=page]:font-bold aria-[current=page]:text-lime-ink";

/**
 * The top bar. What it offers depends on the role in the session: the
 * cookie can be up to five minutes stale, which only matters for showing a
 * link -- every page and procedure behind it re-reads the role from D1.
 *
 * `overlay` is the same bar drawn inside a page's own full-bleed hero (the
 * root leaves its bar out there), so it has to paint above the picture. A
 * visitor with no session sees only the wordmark: that page is somebody's
 * invitation, not the site's pitch.
 */
export default function SiteHeader({ overlay = false }: { overlay?: boolean }) {
	const { session } = useRouteContext({ from: "__root__" });
	const user = session?.user;

	return (
		<Container
			as="header"
			className={cn(
				"flex flex-wrap items-center gap-x-3.5 gap-y-2.5 py-[18px] sm:gap-x-5",
				overlay && "relative",
			)}
		>
			<Link
				to="/"
				className="mr-auto no-underline hover:opacity-90"
				aria-label="Botch RSVP home"
			>
				<Wordmark className="max-sm:text-[17px]" />
			</Link>
			{user ? (
				<>
					<Link to="/events" className={linkClass}>
						{canHost(user) ? "My events" : "My invites"}
					</Link>
					{canHost(user) ? (
						<Link to="/contacts" className={linkClass}>
							Contacts
						</Link>
					) : null}
					{isAdmin(user) ? (
						// On a phone the bar has room for two links and the avatar;
						// Admin moves into the account menu there.
						<Link to="/admin/users" className={`${linkClass} max-sm:hidden`}>
							Admin
						</Link>
					) : null}
					<UserMenu />
				</>
			) : overlay ? null : (
				<>
					<a href="/#how" className={linkClass}>
						How it works
					</a>
					<Link to="/login" className={linkClass}>
						Sign in
					</Link>
					<Link
						to="/login"
						search={{ redirect: "/e/new" }}
						className={buttonVariants({ size: "sm" })}
					>
						Start an invite
					</Link>
				</>
			)}
		</Container>
	);
}
