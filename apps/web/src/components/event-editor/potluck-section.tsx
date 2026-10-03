import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";

import { StepHeading, Switch } from "@/components/controls";
import { Panel } from "@/components/page";

import { nextKey } from "./form";
import type { EventDraft } from "./use-event-draft";

/** Step 5: the things guests can claim to bring. */
export function PotluckSection({ draft }: { draft: EventDraft }) {
	const { form, set, items, setItems } = draft;
	return (
		<Panel className="gap-3">
			<StepHeading
				n={5}
				title="Potluck"
				aside={
					<Switch
						label="Potluck"
						checked={form.potluckEnabled}
						onChange={(v) => set("potluckEnabled", v)}
					/>
				}
			/>
			{form.potluckEnabled ? (
				<>
					{items.map((item, i) => (
						<div key={item.key} className="flex items-center gap-2">
							<Input
								aria-label={`Item ${i + 1}`}
								value={item.label}
								maxLength={80}
								placeholder="Drinks, dessert, bags of ice..."
								onChange={(ev) =>
									setItems((all) =>
										all.map((x) =>
											x.key === item.key ? { ...x, label: ev.target.value } : x,
										),
									)
								}
								className="min-w-0 flex-1"
							/>
							<Input
								type="number"
								min={1}
								max={99}
								aria-label={`How many of item ${i + 1}`}
								value={item.quantity}
								onChange={(ev) =>
									setItems((all) =>
										all.map((x) =>
											x.key === item.key
												? {
														...x,
														quantity: Math.max(
															1,
															Math.min(99, Number(ev.target.value) || 1),
														),
													}
												: x,
										),
									)
								}
								className="w-16 flex-none px-0 text-center"
							/>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={`Remove ${item.label || "item"}`}
								onClick={() =>
									setItems((all) => all.filter((x) => x.key !== item.key))
								}
							>
								×
							</Button>
						</div>
					))}
					<Button
						variant="link"
						className="self-start font-bold"
						onClick={() =>
							setItems((all) => [
								...all,
								{ key: nextKey(), label: "", quantity: 1 },
							])
						}
					>
						+ Add an item
					</Button>
				</>
			) : (
				<span className="text-[14px] text-haze">
					Turn it on to let guests claim what they'll bring.
				</span>
			)}
		</Panel>
	);
}
