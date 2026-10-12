import { canHost } from "@rsvp-site/db/roles";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { PersonDetailsDialog } from "@/components/person-details";
import type { Outputs } from "@/lib/api-types";
import type { DetailsPatch } from "@/lib/details-draft";
import { savedReach } from "@/lib/reach-draft";
import { orpc } from "@/utils/orpc";

/** An admin's edit of anybody: details, email, picture and how they're reached. */
export function EditPerson({
	person: p,
	onClose,
}: {
	person: Outputs["people"]["list"][number];
	onClose: () => void;
}) {
	const update = useMutation(orpc.people.update.mutationOptions());
	const setEmail = useMutation(orpc.people.setEmail.mutationOptions());
	const setPicture = useMutation(
		orpc.people.setPicture.mutationOptions({
			onSuccess: () => toast.success("Picture saved."),
		}),
	);
	const removePicture = useMutation(
		orpc.people.removePicture.mutationOptions(),
	);
	const setReach = useMutation(orpc.people.setReach.mutationOptions());
	return (
		<PersonDetailsDialog
			person={p}
			editable
			pending={update.isPending || setEmail.isPending || setReach.isPending}
			onSave={(patch: DetailsPatch) =>
				update.mutateAsync({ userId: p.id, ...patch })
			}
			onSaveEmail={(email) => setEmail.mutateAsync({ userId: p.id, email })}
			onClose={onClose}
			picture={{
				image: p.image,
				pending: setPicture.isPending || removePicture.isPending,
				onSave: (file) => setPicture.mutateAsync({ userId: p.id, file }),
				onRemove: () => removePicture.mutateAsync({ userId: p.id }),
			}}
			reach={{
				saved: savedReach({
					...p,
					textsOn: p.textsOkAt !== null && p.textsOffAt === null,
				}),
				person: p,
				isHost: canHost(p),
				onSave: (patch) => setReach.mutateAsync({ userId: p.id, ...patch }),
			}}
		/>
	);
}
