import { formatPhone } from "@rsvp-site/db/phone";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { useEffect, useId, useRef, useState } from "react";
import { Field } from "@/components/controls";

/** The detail fields a person carries; blank is stored as an empty string. */
export const DETAIL_KEYS = [
	"firstName",
	"lastName",
	"phone",
	"addressLine1",
	"addressLine2",
	"city",
	"region",
	"postalCode",
	"country",
] as const;
export type DetailKey = (typeof DETAIL_KEYS)[number];
export type DetailsPatch = Partial<Record<DetailKey, string>>;

export type DetailsPerson = {
	name: string;
	email: string;
	noEmail: boolean;
} & Record<DetailKey, string | null>;

/** Only what differs from the saved value; null and "" are the same blank. */
export function changedDetails(
	saved: Record<DetailKey, string | null>,
	draft: Record<DetailKey, string>,
): DetailsPatch {
	const patch: DetailsPatch = {};
	for (const k of DETAIL_KEYS) {
		const was = k === "phone" ? formatPhone(saved[k]) : (saved[k] ?? "");
		if (draft[k].trim() !== was.trim()) patch[k] = draft[k];
	}
	return patch;
}

/** A draft that starts from what is saved (the phone as people read it). */
export function draftOf(p: Record<DetailKey, string | null>) {
	const d = {} as Record<DetailKey, string>;
	for (const k of DETAIL_KEYS) {
		d[k] = k === "phone" ? formatPhone(p[k]) : (p[k] ?? "");
	}
	return d;
}

/**
 * Edit a person's contact details in a modal. The server decides who may
 * (a host only until the person signs in); `editable` and `lockedReason`
 * just keep the form from promising what it would refuse.
 */
export function PersonDetailsDialog({
	person,
	editable,
	lockedReason,
	pending,
	onSave,
	onSaveEmail,
	onClose,
}: {
	person: DetailsPerson;
	editable: boolean;
	lockedReason?: string;
	pending: boolean;
	onSave: (patch: DetailsPatch) => Promise<unknown>;
	onSaveEmail: (email: string) => Promise<unknown>;
	onClose: () => void;
}) {
	const ref = useRef<HTMLDialogElement>(null);
	const firstRef = useRef<HTMLInputElement>(null);
	const id = useId();
	const [draft, setDraft] = useState(() => draftOf(person));
	const [email, setEmail] = useState(person.email);
	const [busy, setBusy] = useState(false);

	// A native dialog gives the focus trap, Esc and inert background; it only
	// has to be opened once mounted.
	useEffect(() => {
		const dialog = ref.current;
		if (dialog && !dialog.open) dialog.showModal();
		firstRef.current?.focus();
	}, []);

	const patch = changedDetails(person, draft);
	const emailChanged = email.trim().toLowerCase() !== person.email;
	const dirty = Object.keys(patch).length > 0 || emailChanged;

	const set = (k: DetailKey) => ({
		id: `${id}-${k}`,
		value: draft[k],
		readOnly: !editable,
		onChange: (e: { target: { value: string } }) =>
			setDraft((d) => ({ ...d, [k]: e.target.value })),
	});

	async function submit() {
		setBusy(true);
		try {
			if (Object.keys(patch).length > 0) await onSave(patch);
			if (emailChanged && email.trim()) await onSaveEmail(email.trim());
			onClose();
		} catch {
			// The query client has already toasted why; stay open to fix it.
		} finally {
			setBusy(false);
		}
	}

	return (
		<dialog
			ref={ref}
			aria-labelledby={`${id}-title`}
			onClose={onClose}
			className="m-auto max-h-[calc(100dvh-32px)] w-[min(560px,calc(100%-32px))] overflow-hidden rounded-[26px] border border-line bg-panel p-0 text-ink backdrop:bg-night/80"
		>
			<form
				className="flex max-h-[calc(100dvh-32px)] flex-col gap-4 overflow-y-auto p-6"
				onSubmit={(e) => {
					e.preventDefault();
					if (editable && dirty) void submit();
				}}
			>
				<h2 id={`${id}-title`} className="m-0 text-[20px]">
					{editable ? "Edit" : "Details for"} {person.name}
				</h2>
				{editable ? null : (
					<p className="m-0 text-[14px] text-haze">
						{lockedReason ?? "These aren't yours to change."}
					</p>
				)}
				<div className="grid grid-cols-2 gap-3">
					<Field label="First name" htmlFor={`${id}-firstName`}>
						<Input
							{...set("firstName")}
							ref={firstRef}
							maxLength={60}
							autoComplete="off"
						/>
					</Field>
					<Field label="Last name" htmlFor={`${id}-lastName`}>
						<Input {...set("lastName")} maxLength={60} autoComplete="off" />
					</Field>
				</div>
				<Field label="Email" htmlFor={`${id}-email`}>
					<Input
						id={`${id}-email`}
						type="email"
						value={email}
						readOnly={!editable}
						placeholder={person.noEmail ? "No email yet" : undefined}
						onChange={(e) => setEmail(e.target.value)}
						autoComplete="off"
					/>
				</Field>
				<Field label="Mobile phone" htmlFor={`${id}-phone`}>
					<Input {...set("phone")} type="tel" autoComplete="off" />
				</Field>
				<fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
					<legend className="mb-2 p-0 font-bold text-[14px]">
						Mailing address
					</legend>
					<Field label="Street address" htmlFor={`${id}-addressLine1`}>
						<Input {...set("addressLine1")} autoComplete="off" />
					</Field>
					<Field label="Apt / suite" htmlFor={`${id}-addressLine2`}>
						<Input {...set("addressLine2")} autoComplete="off" />
					</Field>
					<div className="grid grid-cols-2 gap-3">
						<Field label="City" htmlFor={`${id}-city`}>
							<Input {...set("city")} autoComplete="off" />
						</Field>
						<Field label="State / region" htmlFor={`${id}-region`}>
							<Input {...set("region")} autoComplete="off" />
						</Field>
						<Field label="ZIP / postal code" htmlFor={`${id}-postalCode`}>
							<Input {...set("postalCode")} autoComplete="off" />
						</Field>
						<Field label="Country" htmlFor={`${id}-country`}>
							<Input {...set("country")} autoComplete="off" />
						</Field>
					</div>
				</fieldset>
				<div className="flex flex-wrap justify-end gap-2">
					<Button
						type="button"
						variant="ghost"
						onClick={() => ref.current?.close()}
					>
						{editable ? "Cancel" : "Close"}
					</Button>
					{editable ? (
						<Button type="submit" disabled={!dirty || busy || pending}>
							Save
						</Button>
					) : null}
				</div>
			</form>
		</dialog>
	);
}
