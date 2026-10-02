import { isAdmin } from "@rsvp-site/api/run";
import { buttonVariants } from "@rsvp-site/ui/components/button";
import { Link, useRouteContext } from "@tanstack/react-router";

import { SITE_NAME } from "@/content/run";

import UserMenu from "./user-menu";

const linkClass =
	"text-sm text-ink no-underline hover:text-steel-700 aria-[current=page]:text-steel-700";

export default function Header() {
	// From the root route's context: no extra fetch, no skeleton flash, and
	// the server renders the same nav the browser will.
	const { session } = useRouteContext({ from: "__root__" });

	return (
		<header className="border-divider border-b">
			<nav className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center gap-x-4 gap-y-1.5 px-[clamp(20px,5vw,72px)] py-2.5">
				<Link
					to="/"
					className="mr-auto font-heading font-semibold text-ink text-lg uppercase tracking-[0.02em] no-underline hover:text-steel-700"
				>
					{SITE_NAME}
				</Link>
				<Link to="/" activeOptions={{ exact: true }} className={linkClass}>
					Next event
				</Link>
				{session ? (
					<>
						<Link to="/schedule" className={linkClass}>
							Schedule
						</Link>
						<Link to="/roster" className={linkClass}>
							Guest list
						</Link>
					</>
				) : null}
				<Link to="/rules" className={linkClass}>
					Rules
				</Link>
				{/* Admin belongs with the other places you can go, not inside the
				    account menu -- it was in both, which read as two of them. */}
				{session && isAdmin(session.user) ? (
					<Link to="/admin" className={linkClass}>
						Admin
					</Link>
				) : null}
				{session ? (
					<Link
						to="/"
						hash="rsvp"
						className={buttonVariants({
							size: "sm",
							className: "no-underline",
						})}
					>
						I'm in
					</Link>
				) : null}
				<UserMenu />
			</nav>
		</header>
	);
}
