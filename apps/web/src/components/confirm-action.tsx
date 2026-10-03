import { Button } from "@rsvp-site/ui/components/button";
import {
	type ComponentProps,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";

/**
 * The inline "are you sure?": a button that turns into a confirm and a
 * way out. Focus follows it, so a keyboard user is never left on a button
 * that has just vanished: to the confirm when it opens, back to the
 * trigger when it closes. `onConfirm` gets `close` for the paths that
 * stay on the page after the action.
 */
export function ConfirmAction({
	trigger,
	confirm,
	cancel = "Keep",
	confirmVariant = "destructive",
	size = "sm",
	pending = false,
	onConfirm,
	className,
}: {
	/** The button that opens the question. */
	trigger: Omit<ComponentProps<typeof Button>, "onClick" | "ref">;
	confirm: ReactNode;
	cancel?: ReactNode;
	confirmVariant?: ComponentProps<typeof Button>["variant"];
	/** Size of the confirm and cancel buttons. */
	size?: ComponentProps<typeof Button>["size"];
	pending?: boolean;
	onConfirm: (close: () => void) => void;
	/** For the confirm pair, not the trigger. */
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const confirmRef = useRef<HTMLButtonElement>(null);
	const wasOpen = useRef(false);

	useEffect(() => {
		if (open) confirmRef.current?.focus();
		else if (wasOpen.current) triggerRef.current?.focus();
		wasOpen.current = open;
	}, [open]);

	const close = () => setOpen(false);

	if (!open) {
		return (
			<Button {...trigger} ref={triggerRef} onClick={() => setOpen(true)} />
		);
	}
	return (
		<span className={className ?? "flex gap-1.5"}>
			<Button
				ref={confirmRef}
				variant={confirmVariant}
				size={size}
				disabled={pending}
				onClick={() => onConfirm(close)}
			>
				{confirm}
			</Button>
			<Button variant="ghost" size={size} onClick={close}>
				{cancel}
			</Button>
		</span>
	);
}
