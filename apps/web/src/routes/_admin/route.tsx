import { isAdmin } from "@rsvp-site/db/roles";
import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
} from "@tanstack/react-router";

import { Page, PageHead } from "@/components/page";

export const Route = createFileRoute("/_admin")({
	// The cookie's role decides only whether to show the page; every admin
	// procedure re-reads the role from D1.
	beforeLoad: ({ context, location }) => {
		if (!context.session) {
			throw redirect({ to: "/login", search: { redirect: location.href } });
		}
		if (!isAdmin(context.session.user)) {
			throw redirect({ to: "/events" });
		}
		return { session: context.session };
	},
	component: AdminLayout,
});

const tabClass =
	"rounded-full px-4 py-2 font-bold text-[14px] text-soft no-underline hover:text-ink aria-[current=page]:bg-ink aria-[current=page]:text-on-ink";

function AdminLayout() {
	return (
		<Page className="gap-7">
			<PageHead kicker="Admin" title="The whole site." />
			<nav className="flex flex-wrap gap-0.5 self-start rounded-full bg-panel p-[5px]">
				<Link to="/admin/users" className={tabClass}>
					People
				</Link>
				<Link to="/admin/email" className={tabClass}>
					Email
				</Link>
				<Link to="/events" search={{ all: true }} className={tabClass}>
					Every event
				</Link>
			</nav>
			<Outlet />
		</Page>
	);
}
