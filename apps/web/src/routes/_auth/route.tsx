import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth")({
	component: AuthLayout,
	// The session already came down from the root; this only decides whether
	// to let them through, and remembers where they were headed.
	beforeLoad: ({ context, location }) => {
		if (!context.session) {
			throw redirect({
				to: "/login",
				search: { redirect: location.href },
			});
		}
		return { session: context.session };
	},
});

function AuthLayout() {
	return <Outlet />;
}
