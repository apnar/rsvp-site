import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { DRY_RUN_SUFFIX } from "@/content/site";
import { orpc } from "@/utils/orpc";

/**
 * The row-level actions on a person, one set per row. The mutations take
 * the person's id when called, so a row mounts them once and the details
 * dialog's own (which only matter while it is open) live with the dialog.
 */
export function usePersonActions() {
	const setRole = useMutation(
		orpc.people.setRole.mutationOptions({
			onSuccess: () => {
				toast.success(
					"Role changed. It takes effect the next time they load a page.",
				);
			},
		}),
	);
	const sendLink = useMutation(
		orpc.people.sendLink.mutationOptions({
			onSuccess: (r) => {
				toast.success(`Link sent.${r.dryRun ? DRY_RUN_SUFFIX : ""}`);
			},
		}),
	);
	const newLink = useMutation(
		orpc.people.newLink.mutationOptions({
			onSuccess: () => {
				toast.success(
					"Their old link stopped working and they're signed out everywhere. Send them the new one.",
				);
			},
		}),
	);
	const deactivate = useMutation(orpc.people.deactivate.mutationOptions());
	const reactivate = useMutation(orpc.people.reactivate.mutationOptions());
	return { setRole, sendLink, newLink, deactivate, reactivate };
}
