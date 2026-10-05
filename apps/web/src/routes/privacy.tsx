import { createFileRoute, Link } from "@tanstack/react-router";

import { CONTACT_EMAIL, LegalPage } from "@/components/legal";
import { pageTitle, SITE_NAME } from "@/content/site";

export const Route = createFileRoute("/privacy")({
	head: () => ({ meta: [{ title: pageTitle("Privacy") }] }),
	component: PrivacyPage,
});

/**
 * What the site keeps and who sees it. The texting paragraph is worded the
 * way carriers require of every program they approve: numbers and consent
 * are never shared for anybody's marketing.
 */
function PrivacyPage() {
	return (
		<LegalPage
			kicker="Privacy"
			title="Privacy policy"
			updated="October 4, 2026"
		>
			<p>
				{SITE_NAME} (rsvp.botch.com) keeps only what it takes to run
				invitations, and sells nothing to anybody.
			</p>

			<h2>What we keep</h2>
			<ul>
				<li>
					Your name, email address and, if you or a host who invited you added
					them, your mobile number, mailing address and profile picture.
				</li>
				<li>
					Your answers to invitations: whether you're coming, how many, dietary
					notes and anything you wrote to the host.
				</li>
				<li>
					Which invitations were sent to you, by email or text, whether they
					were delivered, and when you opened an invitation page.
				</li>
				<li>
					A sign-in cookie while you're signed in. No advertising or tracking
					cookies.
				</li>
			</ul>

			<h2>Who sees it</h2>
			<ul>
				<li>
					The hosts of an event you're invited to see your name, your answer and
					your contact details, so they can plan and reach you. Other guests may
					see your name and answer if the host shows the guest list.
				</li>
				<li>
					The services that run the site handle it for us and for nothing else:
					Cloudflare (hosting and storage), Brevo (email) and Telnyx (text
					messages).
				</li>
			</ul>

			<h2>Text messages</h2>
			<p>
				Mobile numbers are used only to send the texts described in the{" "}
				<Link to="/terms">terms</Link>.{" "}
				<strong>
					No mobile information will be shared with third parties or affiliates
					for marketing or promotional purposes. Text messaging opt-in data and
					consent will not be shared with any third parties.
				</strong>{" "}
				Reply STOP to any text to stop them, or HELP for help.
			</p>

			<h2>Your choices</h2>
			<p>
				Your account page lets you change your details, switch email and texts
				on or off, and choose how you'd like to be reached. To have your account
				and everything in it deleted, email{" "}
				<a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
			</p>
		</LegalPage>
	);
}
