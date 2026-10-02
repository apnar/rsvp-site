import { createFileRoute } from "@tanstack/react-router";

import MarketingHome from "@/components/marketing-home";
import PlayerHome from "@/components/player-home";
import { nextHeadcountOptions } from "@/hooks/use-rsvps";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/")({
	component: HomeComponent,
	// Strangers get no headcount and owe nothing, so there is nothing to
	// prefetch for them. Guests get both, so the contributions strip is in the
	// first paint rather than popping in under the hero.
	loader: ({ context }) =>
		context.session
			? Promise.all([
					context.queryClient.ensureQueryData(nextHeadcountOptions()),
					context.queryClient.ensureQueryData(
						orpc.contributions.mine.queryOptions(),
					),
				])
			: null,
});

function HomeComponent() {
	const { session } = Route.useRouteContext();
	return session ? <PlayerHome /> : <MarketingHome />;
}
