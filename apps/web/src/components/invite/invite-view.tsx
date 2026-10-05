import { openSlots } from "@rsvp-site/api/headcount";
import { cn } from "@rsvp-site/ui/lib/utils";
import type { ReactNode } from "react";

import { CountdownTiles } from "@/components/countdown";
import { CardSvg } from "@/components/design/card-svg";
import { EventHero } from "@/components/event-hero";
import { Container } from "@/components/page";
import SiteHeader from "@/components/site-header";
import { CrowdSection } from "./crowd-section";
import { DetailsSection } from "./details-section";
import type { Invite } from "./types";

/**
 * The invitation as a guest sees it: hero, countdown, the details and the
 * crowd, with `aside` (the answer form) beside them. A host gets the same
 * page under `banner`, so what they check is what guests will get.
 */
export function InviteView({
	data,
	aside,
	banner,
}: {
	data: Invite;
	aside: ReactNode;
	banner?: ReactNode;
}) {
	const e = data.event;
	const canceled = e.status === "canceled";

	return (
		<div>
			{banner}
			<EventHero
				header={<SiteHeader overlay />}
				coverKey={e.coverKey}
				theme={data.design?.theme}
				card={
					data.design ? (
						<CardSvg
							scene={data.design.scene}
							className={cn(
								"h-auto w-full rounded-[6px] shadow-float",
								data.design.scene.w > data.design.scene.h
									? "max-w-[860px]"
									: "max-w-[560px]",
							)}
						/>
					) : null
				}
				centered
				size="page"
				tone={canceled ? "ink" : "lime"}
				status={canceled ? "Canceled" : "You're on the list"}
				title={e.title}
				dateLabel={e.dateLabel}
				timeLabel={e.timeLabel}
				location={e.location}
				hostLine={e.hostLine}
			/>

			<Container className="flex flex-col gap-[clamp(40px,6vw,72px)] pt-4 pb-20">
				{canceled ? null : (
					<CountdownTiles
						nowIso={data.now}
						startsAtIso={data.startsAt}
						tiles={[
							{ value: data.totals.yes, label: "said yes" },
							{ value: data.headcount, label: "coming" },
							...(e.potluckEnabled
								? [
										{
											value: openSlots(data.potluck),
											label: "to bring",
											tone: "pink" as const,
										},
									]
								: []),
						]}
					/>
				)}

				<section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-start gap-[clamp(32px,5vw,64px)]">
					{aside}
					<div className="flex flex-col gap-10">
						<DetailsSection event={e} />
						<CrowdSection
							totals={data.totals}
							crowd={data.crowd}
							answers={data.answers}
						/>
					</div>
				</section>
			</Container>
		</div>
	);
}
