import { Button } from "@rsvp-site/ui/components/button";
import {
	type ComponentProps,
	type ReactNode,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react";

/**
 * Focus for anything that swaps a button for a question: a keyboard user is
 * never left on a button that has just vanished. To the confirm button (or
 * `into`, a field in the body) when it opens, back to the trigger when it
 * closes.
 */
export function useConfirmFocus(
	open: boolean,
	into?: RefObject<HTMLElement | null>,
) {
	const triggerRef = useRef<HTMLButtonElement>(null);
	const confirmRef = useRef<HTMLButtonElement>(null);
	const wasOpen = useRef(false);
	useEffect(() => {
		if (open) (into ?? confirmRef).current?.focus();
		else if (wasOpen.current) triggerRef.current?.focus();
		wasOpen.current = open;
	}, [open, into]);
	return { triggerRef, confirmRef };
}

/**
 * The inline "are you sure?": a button that turns into a confirm and a
 * way out. Focus follows it (`useConfirmFocus`). `onConfirm` gets `close`
 * for the paths that stay on the page after the action. With a `title` or
 * `children` the confirm becomes a bordered box carrying them above the
 * buttons; `focusRef` then points at the field to land on instead of the
 * confirm button.
 */
export function ConfirmAction({
	trigger,
	confirm,
	cancel = "Keep",
	confirmVariant = "destructive",
	size = "sm",
	pending = false,
	confirmDisabled = false,
	onConfirm,
	onOpenChange,
	className,
	title,
	children,
	focusRef,
	boxClassName,
}: {
	/** The button that opens the question. */
	trigger: Omit<ComponentProps<typeof Button>, "onClick" | "ref">;
	confirm: ReactNode;
	cancel?: ReactNode;
	confirmVariant?: ComponentProps<typeof Button>["variant"];
	/** Size of the confirm and cancel buttons. */
	size?: ComponentProps<typeof Button>["size"];
	pending?: boolean;
	/** Holds the confirm back (say, while a lookup is still out). */
	confirmDisabled?: boolean;
	onConfirm: (close: () => void) => void;
	/** For a body that only loads while the question is showing. */
	onOpenChange?: (open: boolean) => void;
	/** For the confirm pair, not the trigger. */
	className?: string;
	/** The question, in bold, atop the box. */
	title?: ReactNode;
	/** Extra body between the question and the buttons. */
	children?: ReactNode;
	/** A field in the body to focus on open, in place of the confirm. */
	focusRef?: RefObject<HTMLElement | null>;
	boxClassName?: string;
}) {
	const [open, setOpen] = useState(false);
	const { triggerRef, confirmRef } = useConfirmFocus(open, focusRef);

	const change = (next: boolean) => {
		setOpen(next);
		onOpenChange?.(next);
	};
	const close = () => change(false);

	if (!open) {
		return (
			<Button {...trigger} ref={triggerRef} onClick={() => change(true)} />
		);
	}
	const buttons = (
		<span className={className ?? "flex gap-1.5"}>
			<Button
				ref={confirmRef}
				variant={confirmVariant}
				size={size}
				disabled={pending || confirmDisabled}
				onClick={() => onConfirm(close)}
			>
				{confirm}
			</Button>
			<Button variant="ghost" size={size} onClick={close}>
				{cancel}
			</Button>
		</span>
	);
	if (title === undefined && children === undefined) return buttons;
	return (
		<div
			className={
				boxClassName ??
				"flex basis-full flex-col gap-3 rounded-[20px] border border-destructive/50 p-4"
			}
		>
			{title ? <b>{title}</b> : null}
			{children}
			{buttons}
		</div>
	);
}
