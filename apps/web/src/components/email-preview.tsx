import { Blueprint } from "@rsvp-site/ui/components/blueprint";
import { Button } from "@rsvp-site/ui/components/button";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Shared by the cycle email admin page and the contributions page: both
 * preview and send email the same way, and a preview that differs between
 * pages would be a preview of nothing.
 */

export type Preview = { subject: string; html: string; text: string };
export type ListOutcome = {
	attempted: number;
	sent: number;
	failed: { emails: string[]; error: string }[];
};

export function reportSend(result: ListOutcome) {
	const failed = result.attempted - result.sent;
	if (failed === 0) {
		toast.success(`Sent to ${result.sent}.`);
	} else {
		toast.warning(
			`Sent to ${result.sent}, ${failed} failed. See recent sends.`,
		);
	}
}

export function PreviewPanel({
	preview,
	onClose,
}: {
	preview: Preview & { recipientCount: number };
	onClose: () => void;
}) {
	const [showText, setShowText] = useState(false);
	return (
		<Blueprint className="p-5">
			<div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
				<span className="kicker text-steel-700">
					Preview · goes to {preview.recipientCount}
				</span>
				<div className="flex gap-2">
					<Button
						variant="ghost"
						size="xs"
						onClick={() => setShowText((v) => !v)}
					>
						{showText ? "Show HTML" : "Show plain text"}
					</Button>
					<Button variant="ghost" size="xs" onClick={onClose}>
						Close
					</Button>
				</div>
			</div>
			<p className="mb-3 text-sm">
				<span className="text-neutral-700">Subject:</span>{" "}
				<span className="font-semibold">{preview.subject}</span>
			</p>
			{showText ? (
				<pre className="max-h-[480px] overflow-auto whitespace-pre-wrap border border-divider bg-surface p-3 font-mono text-xs leading-5">
					{preview.text}
				</pre>
			) : (
				<iframe
					title="Email preview"
					sandbox=""
					srcDoc={preview.html}
					className="h-[480px] w-full border border-divider bg-white"
				/>
			)}
		</Blueprint>
	);
}
