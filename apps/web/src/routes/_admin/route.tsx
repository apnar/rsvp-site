import { isAdmin } from "@rsvp-site/api/run";
import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
} from "@tanstack/react-router";

import PageTitle from "@/components/page-title";

export const Route = createFileRoute("/_admin")({
	beforeLoad: ({ context, location }) => {
		if (!context.session) {
			throw redirect({ to: "/login", search: { redirect: location.href } });
		}
		if (!isAdmin(context.session.user)) {
			throw redirect({ to: "/" });
		}
		return { session: context.session };
	},
	component: AdminLayout,
});

const tabClass =
	"kicker border-b-2 border-transparent pb-2 text-ink no-underline hover:text-steel-700 aria-[current=page]:border-steel aria-[current=page]:text-steel-700";

function AdminLayout() {
	return (
		<section className="pt-18 pb-15">
			<PageTitle line1="Host desk." line2="Book the venue. Send the invites." />
			<p className="mt-7 mb-10 max-w-[60ch] text-base leading-6">
				Events only exist once a venue is booked. Add the venue once, put the
				date in, attach any permit, and the headcount opens on the home page.
			</p>
			<nav className="mb-8 flex gap-6 border-divider border-b">
				<Link to="/admin" activeOptions={{ exact: true }} className={tabClass}>
					Events
				</Link>
				<Link to="/admin/gyms" className={tabClass}>
					Venues
				</Link>
				<Link to="/admin/permits" className={tabClass}>
					Permits
				</Link>
				<Link to="/admin/users" className={tabClass}>
					Users
				</Link>
				<Link to="/admin/email" className={tabClass}>
					Email
				</Link>
				<Link to="/admin/contributions" className={tabClass}>
					Contributions
				</Link>
				<Link to="/admin/cycle" className={tabClass}>
					Cycle
				</Link>
			</nav>
			<Outlet />
		</section>
	);
}
