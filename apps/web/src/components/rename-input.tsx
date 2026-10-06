import { Input } from "@rsvp-site/ui/components/input";
import { type ComponentProps, useEffect, useRef, useState } from "react";

/**
 * A name that saves itself on blur or Enter. The server's copy is the
 * truth: the input starts from `value`, follows it when it changes (another
 * refetch, another admin) and goes back to it when the save is refused or
 * the box is left blank, so what it shows is never a name that didn't stick.
 */
export function RenameInput({
	value,
	onCommit,
	...props
}: {
	value: string;
	/** Rejects when the save fails; the query client has already said why. */
	onCommit: (name: string) => Promise<unknown>;
} & Omit<ComponentProps<typeof Input>, "value" | "onChange" | "onCommit">) {
	const [draft, setDraft] = useState(value);
	// Enter commits and the blur after it must not send the same name twice.
	const sent = useRef(value);
	useEffect(() => {
		setDraft(value);
		sent.current = value;
	}, [value]);

	async function commit() {
		const name = draft.trim();
		if (!name) return setDraft(value);
		if (name === sent.current) return;
		sent.current = name;
		try {
			await onCommit(name);
		} catch {
			sent.current = value;
			setDraft(value);
		}
	}

	return (
		<Input
			{...props}
			value={draft}
			onChange={(e) => setDraft(e.target.value)}
			onBlur={() => void commit()}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					void commit();
				}
			}}
		/>
	);
}
