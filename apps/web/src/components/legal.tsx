import type { ReactNode } from "react";

/**
 * The frame the privacy policy and the texting terms share: one readable
 * column, headed like the site's other panels. Carriers' reviewers read
 * these pages, so they stay plain.
 */
export function LegalPage({
	kicker,
	title,
	updated,
	children,
}: {
	kicker: string;
	title: string;
	updated: string;
	children: ReactNode;
}) {
	return (
		<div className="mx-auto w-full max-w-[720px] px-[clamp(16px,4vw,40px)] pt-[clamp(12px,3vw,40px)] pb-20">
			<article className="flex flex-col gap-4 rounded-[28px] border border-line bg-panel p-[clamp(20px,3vw,36px)] text-[15px] text-soft leading-relaxed [&_h2]:mt-4 [&_h2]:mb-0 [&_h2]:text-[18px] [&_h2]:text-ink [&_li]:mb-1 [&_p]:m-0 [&_ul]:m-0 [&_ul]:pl-5">
				<span className="kicker text-lime-ink">{kicker}</span>
				<h1 className="m-0 text-[30px] text-ink">{title}</h1>
				<p className="text-[13px] text-haze">Last updated {updated}</p>
				{children}
			</article>
		</div>
	);
}

export const CONTACT_EMAIL = "info@rsvp.botch.com";
