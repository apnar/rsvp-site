import { Button } from "@rsvp-site/ui/components/button";
import { useState } from "react";
import { toast } from "sonner";

/**
 * The admin email page's preview and send report. The preview renders the
 * same HTML the send would, in a sandboxed frame.
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
		<div className="flex flex-col rounded-[26px] border border-line bg-panel p-5">
			<div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
				<span className="kicker text-haze">
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
				<span className="text-haze">Subject:</span>{" "}
				<span className="font-semibold">{preview.subject}</span>
			</p>
			{showText ? (
				<pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-[14px] bg-night p-3 font-mono text-soft text-xs leading-5">
					{preview.text}
				</pre>
			) : (
				<iframe
					title="Email preview"
					sandbox=""
					srcDoc={preview.html}
					className="h-[480px] w-full rounded-[14px] border-0 bg-white"
				/>
			)}
		</div>
	);
}
