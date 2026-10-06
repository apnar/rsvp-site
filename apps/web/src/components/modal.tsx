import { cn } from "@rsvp-site/ui/lib/utils";
import {
	type ReactNode,
	type RefObject,
	useEffect,
	useId,
	useRef,
} from "react";
import { createPortal } from "react-dom";

/**
 * A modal dialog. A native <dialog> gives the focus trap, Esc and inert
 * background; it only has to be opened once mounted. Children may be a
 * function of `close`, which closes the dialog itself rather than
 * unmounting it, so focus goes back to whatever opened it; the dialog's
 * own close event then tells the parent through `onClose`.
 *
 * Portalled to the body: these open from inside forms (the account page, an
 * admin's details dialog), and a dialog nested in a form would be part of
 * that form.
 */
export function Modal({
	title,
	onClose,
	initialFocus,
	className,
	children,
}: {
	title: ReactNode;
	onClose: () => void;
	/** Focused once open, in place of the dialog's first focusable. */
	initialFocus?: RefObject<HTMLElement | null>;
	/** Width and the like; the panel look is fixed. */
	className?: string;
	children: ReactNode | ((close: () => void) => ReactNode);
}) {
	const ref = useRef<HTMLDialogElement>(null);
	const id = useId();

	useEffect(() => {
		const dialog = ref.current;
		if (dialog && !dialog.open) dialog.showModal();
		initialFocus?.current?.focus();
	}, [initialFocus]);

	const close = () => ref.current?.close();

	return createPortal(
		<dialog
			ref={ref}
			aria-labelledby={`${id}-title`}
			onClose={(e) => {
				// React carries `close` and `cancel` up its own tree, portals
				// included: without this, an admin's details dialog would shut
				// along with the picture dialog opened inside it.
				e.stopPropagation();
				onClose();
			}}
			onCancel={(e) => e.stopPropagation()}
			className={cn(
				"m-auto max-h-[calc(100dvh-32px)] w-[min(440px,calc(100%-32px))] overflow-hidden rounded-[26px] border border-line bg-panel p-0 text-ink backdrop:bg-night/80",
				className,
			)}
		>
			<div className="flex max-h-[calc(100dvh-32px)] flex-col gap-4 overflow-y-auto p-6">
				<h2 id={`${id}-title`} className="m-0 text-[20px]">
					{title}
				</h2>
				{typeof children === "function" ? children(close) : children}
			</div>
		</dialog>,
		document.body,
	);
}
