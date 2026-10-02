import type { Headcount } from "@rsvp-site/api/routers/rsvp";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { RsvpAnswer } from "@/lib/rsvp";
import { orpc } from "@/utils/orpc";

/** Query options for the next game's headcount; the home loader prefetches this. */
export const nextHeadcountOptions = () =>
	orpc.rsvp.list.queryOptions({ input: {} });

/** The same data for one named game -- what the confirm page a cycle email lands on reads. */
export const headcountOptions = (gameId: string) =>
	orpc.rsvp.list.queryOptions({
		input: { gameId },
		// Once the final call has passed and no verdict has landed, the cron is
		// about to write one. Poll until it does, then stop.
		refetchInterval: (query) => {
			const data = query.state.data as Headcount | null | undefined;
			if (!data || data.game.decidedAt || data.game.status === "canceled") {
				return false;
			}
			const final = data.game.cycle.stages.find((s) => s.key === "final")?.at;
			return final && Date.now() >= Date.parse(final) ? 15_000 : false;
		},
	});

/**
 * The shared headcount for a game, stored in D1 and read through oRPC.
 * `headcount` is null when no event is booked.
 */
export function useRsvps(gameId?: string) {
	const queryClient = useQueryClient();
	const listOptions = gameId
		? headcountOptions(gameId)
		: nextHeadcountOptions();
	const query = useQuery(listOptions);

	/**
	 * The board reads the "next game" cache entry and the confirm page reads a
	 * per-game one, so a write has to land in both or one of them goes stale.
	 * The next-game entry is only overwritten when it is the same game -- an
	 * admin poking at an older game must not blank the board.
	 */
	const onSuccess = (data: Headcount | null) => {
		if (!data) return;
		queryClient.setQueryData(headcountOptions(data.game.id).queryKey, data);
		const nextKey = nextHeadcountOptions().queryKey;
		const current = queryClient.getQueryData<Headcount | null>(nextKey);
		if (!current || current.game.id === data.game.id) {
			queryClient.setQueryData(nextKey, data);
		}
		// `inCount` lives on the game, so the schedule and the admin tables
		// are stale the moment anybody answers.
		queryClient.invalidateQueries({ queryKey: orpc.games.key() });
	};
	const onError = (error: Error) => toast.error(error.message);

	const addMutation = useMutation(
		orpc.rsvp.add.mutationOptions({ onSuccess, onError }),
	);
	const respondMutation = useMutation(
		orpc.rsvp.respond.mutationOptions({ onSuccess, onError }),
	);
	const setResponseMutation = useMutation(
		orpc.rsvp.setResponse.mutationOptions({ onSuccess, onError }),
	);
	const removeGuestMutation = useMutation(
		orpc.rsvp.removeGuest.mutationOptions({ onSuccess, onError }),
	);
	// Ending a break belongs to the people router, but the button that does it
	// lives on the board, so the refetch is wired up here with the rest.
	const comeBackMutation = useMutation(
		orpc.people.unsuspend.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.rsvp.key() });
				queryClient.invalidateQueries({ queryKey: orpc.people.key() });
				toast.success("You're back on. Put your name in.");
			},
			onError,
		}),
	);

	const id = query.data?.game.id;

	return {
		headcount: query.data ?? null,
		isPending:
			addMutation.isPending ||
			respondMutation.isPending ||
			setResponseMutation.isPending ||
			removeGuestMutation.isPending,
		/** Your own answer. What the buttons in every cycle email end up calling. */
		respond: (answer: RsvpAnswer) => {
			if (!id) return Promise.resolve(undefined);
			return respondMutation.mutateAsync({ gameId: id, answer });
		},
		/** Somebody else's -- yours to set only if you put them on the sheet. */
		setResponse: (rowId: string, answer: RsvpAnswer) => {
			if (!id) return;
			setResponseMutation.mutate({ gameId: id, id: rowId, answer });
		},
		add: (name: string) => {
			if (!id) return Promise.resolve(undefined);
			return addMutation.mutateAsync({ gameId: id, name });
		},
		/** Take a guest back off. Only ever your own, which the server enforces. */
		removeGuest: (rowId: string) => {
			if (!id) return;
			removeGuestMutation.mutate({ gameId: id, id: rowId });
		},
		comeBack: () => comeBackMutation.mutate({}),
		backPending: comeBackMutation.isPending,
	};
}
