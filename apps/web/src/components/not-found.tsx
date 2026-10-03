import { buttonVariants } from "@rsvp-site/ui/components/button";
import { type ErrorComponentProps, Link } from "@tanstack/react-router";

import { Page } from "./page";

/**
 * Nothing here -- including an event the caller is not invited to, which
 * the API answers exactly like one that does not exist.
 */
export function NotFound({
	title = "Nothing here.",
	body = "That page doesn't exist, or it isn't yours to see.",
}: {
	title?: string;
	body?: string;
}) {
	return (
		<Page className="items-start gap-5 pt-[clamp(28px,6vw,72px)]">
			<span className="kicker text-pink-ink">Hmm</span>
			<h1 className="m-0 font-black text-[clamp(34px,5.6vw,64px)] tracking-[-0.04em]">
				{title}
			</h1>
			<p className="m-0 max-w-[50ch] text-[17px] text-soft">{body}</p>
			<Link to="/" className={buttonVariants()}>
				Take me home
			</Link>
		</Page>
	);
}

/** Loader and render errors. An API "no such event" reads as not found. */
export function RouteError({ error: raw }: ErrorComponentProps) {
	const error = raw instanceof Error ? raw : new Error(String(raw));
	// After a server render the error arrives without its oRPC `code`, so
	// the API's own wording is the other way to recognise a not-found.
	const code = (error as { code?: string }).code;
	if (code === "NOT_FOUND" || /^No such /.test(error.message)) {
		return <NotFound body={error.message} />;
	}
	if (code === "UNAUTHORIZED") {
		return (
			<NotFound
				title="Sign in first."
				body="That page is only for people who are signed in."
			/>
		);
	}
	return (
		<NotFound
			title="That went sideways."
			body={error.message || "Something broke. Try again in a moment."}
		/>
	);
}
