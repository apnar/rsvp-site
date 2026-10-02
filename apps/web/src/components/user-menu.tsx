import { Button } from "@rsvp-site/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@rsvp-site/ui/components/dropdown-menu";
import {
	Link,
	useNavigate,
	useRouteContext,
	useRouter,
} from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

/**
 * The account menu, and only that. Everywhere you can go lives in the nav
 * beside it, so this holds the two things that are not places -- who you are
 * signed in as, and the way out -- plus the one page that is nobody else's
 * business.
 *
 * The address is a label rather than an item: it is the answer to "which
 * account is this", which matters when people get in from links mailed to
 * two different addresses, and it was never something you could click.
 */
export default function UserMenu() {
	const navigate = useNavigate();
	const router = useRouter();
	const { session } = useRouteContext({ from: "__root__" });

	if (!session) {
		return (
			<Link
				to="/login"
				className="text-ink text-sm no-underline hover:text-steel-700 aria-[current=page]:text-steel-700"
			>
				Sign in
			</Link>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
				{session.user.name}
			</DropdownMenuTrigger>
			{/* The popup takes the trigger's width by default, and the trigger is
			    a short name. An address needs more room than that. */}
			<DropdownMenuContent align="end" className="w-auto min-w-56">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="px-2 pt-2 pb-1.5">
						<span className="kicker block text-[11px] text-steel-700">
							Signed in as
						</span>
						<span className="mt-1 block break-all text-ink text-xs">
							{session.user.email}
						</span>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						render={<Link to="/dashboard" className="no-underline" />}
					>
						Your account
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						onClick={() => {
							authClient.signOut({
								fetchOptions: {
									onSuccess: async () => {
										// The session came from the root route; make the
										// router go and notice it is gone.
										await router.invalidate();
										navigate({ to: "/" });
									},
								},
							});
						}}
					>
						Sign out
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
