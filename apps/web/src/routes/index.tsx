import { buttonVariants } from "@rsvp-site/ui/components/button";
import { cn } from "@rsvp-site/ui/lib/utils";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Fragment } from "react";

import { Cover } from "@/components/cover";
import { ResponseBar } from "@/components/response-bar";
import { FEATURES, OCCASIONS, STEPS } from "@/content/site";

export const Route = createFileRoute("/")({
	// Signed in, the front page is your events; the pitch is for strangers.
	beforeLoad: ({ context }) => {
		if (context.session) throw redirect({ to: "/events" });
	},
	component: Landing,
});

const START = { to: "/login", search: { redirect: "/e/new" } } as const;

function Landing() {
	return (
		<>
			<section className="mx-auto grid max-w-[1180px] grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-center gap-[clamp(36px,5vw,64px)] px-[clamp(16px,4vw,40px)] py-[clamp(28px,6vw,72px)]">
				<div className="flex flex-col gap-6">
					<span className="self-start rounded-full border border-pink px-3.5 py-1.5 font-bold text-[13px] text-pink-soft uppercase tracking-[0.08em]">
						Invites + RSVPs
					</span>
					<h1 className="m-0 font-black text-[clamp(44px,7.4vw,100px)] leading-[0.94] tracking-[-0.045em]">
						You bring the party.{" "}
						<span className="text-lime-ink">We'll count heads.</span>
					</h1>
					<p className="m-0 max-w-[44ch] text-[18px] text-soft leading-[1.55]">
						Make a great-looking invite in five minutes, send it to the whole
						crew, and watch the yeses roll in. Plus-ones, kids, allergies and
						who's bringing the ice, all in one list.
					</p>
					<div className="flex flex-wrap gap-2.5">
						<Link
							{...START}
							className={buttonVariants({
								size: "lg",
								className: "font-heading shadow-lime",
							})}
						>
							Start an invite
						</Link>
						<a
							href="#how"
							className={buttonVariants({ variant: "secondary", size: "lg" })}
						>
							How it works
						</a>
					</div>
				</div>
				<div className="relative pb-12">
					<div className="ml-auto aspect-[4/5] w-[86%] overflow-hidden rounded-[32px]">
						<Cover coverKey={null} />
					</div>
					<div className="absolute bottom-0 left-0 flex w-[min(300px,76%)] flex-col gap-3 rounded-[24px] border border-line bg-panel p-[18px] shadow-float">
						<span className="kicker text-[12px] text-haze">
							House Crawl · Sat, Oct 24
						</span>
						<div className="flex items-baseline gap-2.5">
							<span className="numeral font-black text-[52px] text-lime-ink leading-[0.9]">
								42
							</span>
							<span className="font-bold text-[16px]">families in</span>
						</div>
						<ResponseBar totals={{ yes: 42, maybe: 9, no: 6, waiting: 14 }} />
						<span className="text-[13px] text-soft">
							The Nguyens just said yes, +3
						</span>
					</div>
					<span className="absolute top-[18px] left-[4%] -rotate-6 rounded-full bg-pink px-4 py-2.5 font-bold text-[14px] text-on-pink">
						Yes! +2 kids
					</span>
				</div>
			</section>

			<div className="overflow-hidden border-line border-y">
				<div className="flex gap-7 whitespace-nowrap py-[18px] font-bold font-heading text-[clamp(20px,2.8vw,32px)] tracking-[-0.03em]">
					{OCCASIONS.map((o, i) => (
						<Fragment key={o}>
							<span>{o}</span>
							{i < OCCASIONS.length - 1 ? (
								<span
									aria-hidden
									className={i % 2 === 0 ? "text-lime-ink" : "text-pink-ink"}
								>
									✦
								</span>
							) : null}
						</Fragment>
					))}
				</div>
			</div>

			<section
				id="how"
				className="mx-auto flex max-w-[1180px] scroll-mt-6 flex-col gap-7 px-[clamp(16px,4vw,40px)] pt-[clamp(48px,7vw,96px)]"
			>
				<h2 className="m-0 font-black text-[clamp(30px,4.4vw,52px)] leading-none tracking-[-0.04em]">
					Four steps to a full house
				</h2>
				<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-3.5">
					{STEPS.map((step, i) => {
						const last = i === STEPS.length - 1;
						return (
							<div
								key={step.title}
								className={cn(
									"flex flex-col gap-2.5 rounded-[26px] p-6",
									last ? "bg-pink text-on-pink" : "bg-panel",
								)}
							>
								<span
									className={cn(
										"numeral text-[36px]",
										last ? "text-on-pink" : "text-lime-ink",
									)}
								>
									{String(i + 1).padStart(2, "0")}
								</span>
								<b className="text-[19px]">{step.title}</b>
								<span className={cn("text-[15px]", last ? "" : "text-soft")}>
									{step.body}
								</span>
							</div>
						);
					})}
				</div>
			</section>

			<section className="mx-auto flex max-w-[1180px] flex-col gap-7 px-[clamp(16px,4vw,40px)] py-[clamp(48px,7vw,96px)]">
				<h2 className="m-0 font-black text-[clamp(30px,4.4vw,52px)] leading-none tracking-[-0.04em]">
					Every answer a host needs
				</h2>
				<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-x-10">
					{FEATURES.map((f) => (
						<div key={f.title} className="border-line border-t py-[18px]">
							<b className="text-[18px]">{f.title}</b>
							<div className="mt-1 text-[15px] text-soft">{f.body}</div>
						</div>
					))}
				</div>
			</section>

			<section className="mx-auto max-w-[1180px] px-[clamp(16px,4vw,40px)] pb-[clamp(48px,7vw,80px)]">
				<div className="flex flex-wrap items-end justify-between gap-6 rounded-[32px] bg-lime p-[clamp(28px,5vw,56px)] text-on-lime">
					<h2 className="m-0 flex-[1_1_400px] font-black text-[clamp(34px,5.4vw,68px)] leading-[0.95] tracking-[-0.045em]">
						Your next party starts here.
					</h2>
					<Link
						{...START}
						className={buttonVariants({
							variant: "light",
							size: "lg",
							className:
								"border-night bg-night font-heading text-ink hover:border-panel-2 hover:bg-panel-2 hover:text-ink",
						})}
					>
						Start an invite
					</Link>
				</div>
			</section>
		</>
	);
}
