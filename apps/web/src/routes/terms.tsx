import { createFileRoute, Link } from "@tanstack/react-router";

import { CONTACT_EMAIL, LegalPage } from "@/components/legal";
import { pageTitle, SITE_NAME } from "@/content/site";

export const Route = createFileRoute("/terms")({
	head: () => ({ meta: [{ title: pageTitle("Terms") }] }),
	component: TermsPage,
});

/**
 * The terms, chiefly the text-message program's: carriers approve a
 * texting campaign only when the site states, where anybody can read it,
 * what the texts are, how often they come, what they may cost and how to
 * stop them.
 */
function TermsPage() {
	return (
		<LegalPage kicker="Terms" title="Terms of use" updated="October 4, 2026">
			<p>
				{SITE_NAME} (rsvp.botch.com) lets hosts send invitations to their
				parties and gatherings and lets guests answer them. Using the site means
				agreeing to these terms and to the{" "}
				<Link to="/privacy">privacy policy</Link>.
			</p>

			<h2>Text messages</h2>
			<p>
				<strong>Program:</strong> {SITE_NAME} event texts.
			</p>
			<p>
				<strong>What you get:</strong> texts about events you are invited to or
				host: the invitation itself (sometimes with a picture of the
				invitation), reminders before an RSVP deadline and the day before,
				changes of date, time or place, cancellations, a host's reminder to
				answer, and, for hosts who turn them on, alerts when guests reply. If
				you ask for one on the sign-in page, you also get a sign-in link. We
				never send advertising.
			</p>
			<p>
				<strong>How you agree to them:</strong> a host who adds your mobile
				number to an invitation confirms that you expect texts from them about
				it, and the first text names the host and the event and says how to
				stop. You can also switch texts on or off yourself on your account page.
			</p>
			<p>
				<strong>How often:</strong> message frequency varies with the events you
				are part of, usually a few texts per event.
			</p>
			<p>
				<strong>Cost:</strong> message and data rates may apply. {SITE_NAME}{" "}
				does not charge for texts.
			</p>
			<p>
				<strong>Stopping:</strong> reply <strong>STOP</strong> to any text to
				stop all texts from us. Reply <strong>START</strong> to get them again.
				You can also turn texts off on your account page.
			</p>
			<p>
				<strong>Help:</strong> reply <strong>HELP</strong>, or email{" "}
				<a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
			</p>
			<p>Carriers are not liable for delayed or undelivered messages.</p>

			<h2>Email</h2>
			<p>
				Invitations, reminders and sign-in links also come by email. Every
				invitation email has a link to stop them, and your account page has a
				switch.
			</p>

			<h2>Using the site</h2>
			<ul>
				<li>
					Hosts invite only people they know and who would expect to hear from
					them.
				</li>
				<li>
					Sign-in links in emails and texts are personal: anybody holding one
					can answer as you. Don't forward them, and replace yours from your
					account page if one gets out.
				</li>
				<li>
					The site is offered as is, without any warranty, and may change or
					stop.
				</li>
			</ul>

			<h2>Contact</h2>
			<p>
				<a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
			</p>
		</LegalPage>
	);
}
