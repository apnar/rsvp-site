import { isAdmin } from "@rsvp-site/db/roles";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@rsvp-site/ui/components/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import {
	Link,
	useNavigate,
	useRouteContext,
	useRouter,
} from "@tanstack/react-router";

import { Avatar } from "@/components/brand";
import { authClient } from "@/lib/auth-client";
import { initials } from "@/lib/format";

/**
 * The account menu behind your picture (or your pink initials). Places
 * live in the nav beside it; this holds who you are signed in as, your
 * account, and the way out.
 * The address is a label rather than an item: it answers "which account is
 * this", which matters when people get in from links sent to two addresses.
 */
export default function UserMenu() {
	const navigate = useNavigate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { session } = useRouteContext({ from: "__root__" });
	if (!session) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label="Your account"
				className="cursor-pointer rounded-full border-0 bg-transparent p-0 outline-none focus-visible:outline-2 focus-visible:outline-lime focus-visible:outline-offset-2"
			>
				<Avatar
					initials={initials(session.user.name)}
					image={session.user.image}
					tone="pink"
					className="size-9 text-[13px]"
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-auto min-w-56">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="px-3 pt-2 pb-1.5">
						<span className="kicker block text-[11px] text-haze">
							Signed in as
						</span>
						<span className="mt-1 block break-all text-ink text-sm">
							{session.user.email}
						</span>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						render={<Link to="/account" className="text-ink no-underline" />}
					>
						Your account
					</DropdownMenuItem>
					{isAdmin(session.user) ? (
						<DropdownMenuItem
							className="sm:hidden"
							render={
								<Link to="/admin/users" className="text-ink no-underline" />
							}
						>
							Admin
						</DropdownMenuItem>
					) : null}
					<DropdownMenuItem
						variant="destructive"
						onClick={() => {
							authClient.signOut({
								fetchOptions: {
									onSuccess: async () => {
										// The next person to sign in on this tab must not see
										// this one's events from the cache.
										queryClient.clear();
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
