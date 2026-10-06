import type { DietId } from "@rsvp-site/db/diets";
import { formatPhone, normalizePhone } from "@rsvp-site/db/phone";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import {
	type ChangeEvent,
	type ComponentProps,
	type ReactNode,
	type RefObject,
	useId,
	useRef,
	useState,
} from "react";
import { AvatarField } from "@/components/avatar/avatar-field";
import { Field } from "@/components/controls";
import { DietFields, type DietValue, sameDiet } from "@/components/diet";
import { Modal } from "@/components/modal";

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
export type DetailsPatch = Partial<Record<DetailKey, string>> & {
	diets?: DietId[];
	dietNote?: string;
};

export type DetailsPerson = {
	name: string;
	email: string;
	noEmail: boolean;
	diets: DietId[];
	dietNote: string;
} & Record<DetailKey, string | null>;

const DETAIL_LABELS: Record<DetailKey, string> = {
	firstName: "First name",
	lastName: "Last name",
	phone: "Mobile phone",
	addressLine1: "Street address",
	addressLine2: "Apt / suite",
	city: "City",
	region: "State / region",
	postalCode: "ZIP / postal code",
	country: "Country",
};

const DETAIL_LIMITS: Record<DetailKey, number> = {
	firstName: 60,
	lastName: 60,
	phone: 40,
	addressLine1: 100,
	addressLine2: 100,
	city: 60,
	region: 60,
	postalCode: 20,
	country: 60,
};

const DETAIL_AUTOCOMPLETE: Record<DetailKey, string> = {
	firstName: "given-name",
	lastName: "family-name",
	phone: "tel",
	addressLine1: "address-line1",
	addressLine2: "address-line2",
	city: "address-level2",
	region: "address-level1",
	postalCode: "postal-code",
	country: "country-name",
};

/**
 * The name, phone and address fields, shared by the account page and the
 * details dialog so their labels and limits cannot drift. `email` is a slot
 * between the names and the phone because who may change it differs by
 * caller. "profile" autocomplete is for people filling in their own
 * details; "off" for somebody else's.
 */
export function DetailFields({
	idPrefix,
	draft,
	onChange,
	readOnly,
	reachReadOnly = readOnly,
	autoComplete,
	firstRef,
	email,
}: {
	idPrefix: string;
	draft: Record<DetailKey, string>;
	onChange: (key: DetailKey, value: string) => void;
	readOnly?: boolean;
	/** The phone alone, for callers who may change the rest but not how to reach them. */
	reachReadOnly?: boolean;
	autoComplete: "profile" | "off";
	firstRef?: RefObject<HTMLInputElement | null>;
	email: ReactNode;
}) {
	const input = (k: DetailKey) => ({
		id: `${idPrefix}-${k}`,
		value: draft[k],
		readOnly,
		maxLength: DETAIL_LIMITS[k],
		autoComplete: autoComplete === "off" ? "off" : DETAIL_AUTOCOMPLETE[k],
		onChange: (e: ChangeEvent<HTMLInputElement>) => onChange(k, e.target.value),
	});
	const field = (k: DetailKey) => (
		<Field label={DETAIL_LABELS[k]} htmlFor={`${idPrefix}-${k}`}>
			<Input {...input(k)} />
		</Field>
	);
	return (
		<>
			<div className="grid grid-cols-2 gap-3">
				<Field
					label={DETAIL_LABELS.firstName}
					htmlFor={`${idPrefix}-firstName`}
				>
					<Input {...input("firstName")} ref={firstRef} />
				</Field>
				{field("lastName")}
			</div>
			{email}
			<Field label={DETAIL_LABELS.phone} htmlFor={`${idPrefix}-phone`}>
				<Input {...input("phone")} readOnly={reachReadOnly} type="tel" />
			</Field>
			<fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
				<legend className="mb-2 p-0 font-bold text-[14px]">
					Mailing address
				</legend>
				{field("addressLine1")}
				{field("addressLine2")}
				<div className="grid grid-cols-2 gap-3">
					{field("city")}
					{field("region")}
					{field("postalCode")}
					{field("country")}
				</div>
			</fieldset>
		</>
	);
}

/**
 * Only what differs from the saved value; null and "" are the same blank.
 * The phone is compared as stored: the draft shows "(301) 555-1234" but
 * people type "301-555-1234", and comparing text would leave Save lit
 * after every save.
 */
export function changedDetails(
	saved: Record<DetailKey, string | null>,
	draft: Record<DetailKey, string>,
): DetailsPatch {
	const patch: DetailsPatch = {};
	for (const k of DETAIL_KEYS) {
		const typed = draft[k].trim();
		const same =
			k === "phone"
				? (normalizePhone(typed) ?? typed) === (saved[k] ?? "")
				: typed === (saved[k] ?? "").trim();
		if (!same) patch[k] = draft[k];
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
	onClose,
	...props
}: DetailsFormProps & { onClose: () => void }) {
	const firstRef = useRef<HTMLInputElement>(null);
	return (
		<Modal
			title={`${props.editable ? "Edit" : "Details for"} ${props.person.name}`}
			onClose={onClose}
			initialFocus={firstRef}
			className="w-[min(560px,calc(100%-32px))]"
		>
			{(close) => <DetailsForm {...props} firstRef={firstRef} close={close} />}
		</Modal>
	);
}

type DetailsFormProps = {
	person: DetailsPerson;
	editable: boolean;
	/**
	 * Whether this caller may change their email and phone. Not the same as
	 * `editable`: a host who didn't first add somebody may fix their name
	 * and address but not where their invitations go.
	 */
	reachEditable?: boolean;
	lockedReason?: string;
	pending: boolean;
	onSave: (patch: DetailsPatch) => Promise<unknown>;
	onSaveEmail: (email: string) => Promise<unknown>;
	/** Their picture's controls, for the callers allowed them (admins). */
	picture?: Omit<ComponentProps<typeof AvatarField>, "name" | "mine">;
};

function DetailsForm({
	person,
	editable,
	reachEditable = true,
	lockedReason,
	pending,
	onSave,
	onSaveEmail,
	picture,
	firstRef,
	close,
}: DetailsFormProps & {
	firstRef: RefObject<HTMLInputElement | null>;
	close: () => void;
}) {
	const id = useId();
	const [draft, setDraft] = useState(() => draftOf(person));
	const savedDiet: DietValue = { diets: person.diets, note: person.dietNote };
	const [diet, setDiet] = useState(savedDiet);
	const [email, setEmail] = useState(person.email);
	const [busy, setBusy] = useState(false);

	// Diet fields go in the patch only when changed: saving either one stamps
	// the person's diet as confirmed, which an untouched form must not do.
	const patch: DetailsPatch = changedDetails(person, draft);
	if (!sameDiet(diet, savedDiet)) {
		patch.diets = diet.diets;
		patch.dietNote = diet.note;
	}
	const emailChanged = email.trim().toLowerCase() !== person.email;
	const dirty = Object.keys(patch).length > 0 || emailChanged;

	async function submit() {
		setBusy(true);
		try {
			if (Object.keys(patch).length > 0) await onSave(patch);
			if (emailChanged && email.trim()) await onSaveEmail(email.trim());
			// Closing the dialog (not unmounting it) hands focus back to
			// whatever opened it; its close handler tells the parent.
			close();
		} catch {
			// The query client has already toasted why; stay open to fix it.
		} finally {
			setBusy(false);
		}
	}

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(e) => {
				e.preventDefault();
				if (editable && dirty) void submit();
			}}
		>
			{editable ? null : (
				<p className="m-0 text-[14px] text-haze">
					{lockedReason ?? "These aren't yours to change."}
				</p>
			)}
			{editable && !reachEditable ? (
				<p className="m-0 text-[14px] text-haze">
					Only the host who first added them can change their email or phone.
				</p>
			) : null}
			{picture ? (
				<AvatarField {...picture} name={person.name} mine={false} />
			) : null}
			<DetailFields
				idPrefix={id}
				draft={draft}
				onChange={(k, v) => setDraft((d) => ({ ...d, [k]: v }))}
				readOnly={!editable}
				reachReadOnly={!editable || !reachEditable}
				firstRef={firstRef}
				autoComplete="off"
				email={
					<Field label="Email" htmlFor={`${id}-email`}>
						<Input
							id={`${id}-email`}
							type="email"
							value={email}
							readOnly={!editable || !reachEditable}
							placeholder={person.noEmail ? "No email yet" : undefined}
							onChange={(e) => setEmail(e.target.value)}
							autoComplete="off"
						/>
					</Field>
				}
			/>
			<fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
				<legend className="mb-2 p-0 font-bold text-[14px]">
					Dietary needs
				</legend>
				<DietFields
					value={diet}
					onChange={setDiet}
					idPrefix={id}
					disabled={!editable}
				/>
			</fieldset>
			<div className="flex flex-wrap justify-end gap-2">
				<Button type="button" variant="ghost" onClick={close}>
					{editable ? "Cancel" : "Close"}
				</Button>
				{editable ? (
					<Button type="submit" disabled={!dirty || busy || pending}>
						Save
					</Button>
				) : null}
			</div>
		</form>
	);
}
