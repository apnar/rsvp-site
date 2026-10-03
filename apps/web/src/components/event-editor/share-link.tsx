import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

export function ShareLink({ eventId, url }: { eventId: string; url: string }) {
	const reset = useMutation(
		orpc.events.resetShareLink.mutationOptions({
			onSuccess: () => {
				toast.success("New link made. The old one stopped working.");
			},
		}),
	);
	return (
		<div className="flex flex-wrap items-center gap-2 pb-3.5">
			<Input
				readOnly
				value={url}
				aria-label="Share link"
				className="min-w-0 flex-[1_1_240px] rounded-full"
				onFocus={(ev) => ev.target.select()}
			/>
			<Button
				variant="light"
				size="sm"
				onClick={async () => {
					await navigator.clipboard.writeText(url);
					toast.success("Copied.");
				}}
			>
				Copy
			</Button>
			<Button
				variant="ghost"
				size="sm"
				disabled={reset.isPending}
				onClick={() => reset.mutate({ eventId })}
			>
				New link
			</Button>
			<span className="basis-full text-[13px] text-haze">
				The link works once the invites have gone out. Save to switch it on or
				off.
			</span>
		</div>
	);
}
