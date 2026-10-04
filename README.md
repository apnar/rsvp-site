# rsvp-site

Botch RSVP: party invitations with RSVPs, at https://rsvp.botch.com. A host
makes an event (cover photo, when and where, what to ask, a potluck), invites
people by email or from a contact group, and watches the answers come in --
yes, maybe or can't, with plus-ones, kids, dietary notes and a note to the
host.

It started as a copy of [pickup-bball](https://github.com/apnar/pickup-bball), the app behind a weekly basketball run, and the bones are the same: one Cloudflare Worker, D1, R2, Better Auth with emailed sign-in links, and Brevo for the mail. The model on top is its own: per-event guest lists, three roles, and emails scheduled from each event's own dates.

## Stack

TanStack Start (React, SSR) and a Hono API in one Cloudflare Worker, with oRPC between them; D1 through Drizzle; R2 for pictures; Better Auth with this site's own emailed sign-in links; Brevo for mail; Tailwind with the After Dark tokens in `packages/ui`; Turborepo, Biome and Vitest. The scaffold came from [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack).

## Getting Started

Install dependencies:

```bash
pnpm install
```

## How it is hosted

The whole site runs as a single Cloudflare Worker on the free plan:

- `apps/web` is a TanStack Start app built with the Cloudflare Vite plugin. Static assets are served by Workers Assets and pages are server-rendered in the Worker.
- The Hono API lives inside the same Worker at `/api/*` (`apps/web/src/server/app.ts`, mounted by `apps/web/src/routes/api/$.ts`). Same origin means no CORS and ordinary same-site cookies.
  - `/api/auth/*` - Better Auth
  - `/api/rpc` - oRPC (the web app calls this from the browser and calls the router directly during SSR)
  - `/api/unsubscribe/:token` - one-click unsubscribe pages for list emails
  - `/api/brevo/webhook` - Brevo tells the app who unsubscribed, bounced or complained
  - `/api/health` - health check
- `/api/covers/:name` serves event cover photos from the `MEDIA` R2 bucket.
- A Cron Trigger runs the Worker's `scheduled` handler (`apps/web/src/server.ts`) every half hour. It sends each event's due reminders and host digests. See "The email schedule" below.
- The database is Cloudflare D1 (SQLite) accessed through Drizzle via the `DB` binding. Env vars, secrets and bindings come from `cloudflare:workers` (typed in `packages/env/env.d.ts`, which must match `apps/web/wrangler.jsonc`).

## Local development

1. Create `apps/web/.dev.vars` from `apps/web/.dev.vars.example` and set a random `BETTER_AUTH_SECRET`. `BREVO_API_KEY` is optional: without it every email is printed to the dev server's console instead of sent, which is the normal local setup.
2. Apply the migrations to the local D1 database (stored under `apps/web/.wrangler/`):

```bash
pnpm run db:migrate:local
```

3. Start the dev server. Vite runs the server side inside workerd, so bindings behave as they do in production:

```bash
pnpm run dev
```

Open [http://localhost:3001](http://localhost:3001).

## Who sees what

There is one table of people, `user`: the accounts, the guests and the mailing list at once. Each person has a **role**:

| Role | Can |
|---|---|
| `user` (a guest) | answer the invitations they have, see those events, manage their own account |
| `host` | everything a guest can, plus make events, invite anybody by email, keep contact groups |
| `admin` | everything a host can, plus see and manage every event, add people, set roles, deactivate or delete people |

Roles live in `user.role` (null reads as `user`) and are read through `roleOf` / `canHost` / `isAdmin` in `packages/db/src/roles.ts`, which the web app and the API share. Better Auth's admin plugin only knows `admin` and `user`, so roles are written by `people.setRole`, not by its `setRole`.

- **Strangers** get the landing page, and a share link's teaser if they have one: cover, title, date and the host line. Never the address, the details or who is coming.
- **Guests** see an event only if they are on its list, and never a draft. A wrong id and an event that is not yours answer the same "no such event", so ids cannot be probed. Other guests' names show only when the host leaves "Show who's coming" on; counts always show; notes, dietary info and addresses are for hosts.
- **Families** (`family`, `family_member`) are households, kept by admins on `/admin/families`; a person is in at most one. Anybody in a family may answer, from the invite page or their printed card, for relatives who are on the same event's list and nobody else, and hosts see who answered on the guest list (`event_guest.answered_by`). A member flagged a child counts as a kid, not an adult, when a relative answers for them; a family may hold name-only people (young kids) who are never emailed. Only an admin or the person themselves edits a family member's details, so a host cannot change them even with them in their book.
- **Hosts** see and run the events they host -- the creator (owner) and any co-hosts, who must themselves be hosts. Admins see everything.
- **Views**: hosts see when each guest first opened their invitation (`event_guest.viewed_at`, and `last_viewed_at` in the CSV), on the guest list and in a "Viewed, no reply" filter. The host's list is in sections -- yes, maybe, can't, viewed with no reply, not viewed -- alphabetical inside each. Guests are never shown it. Only the guest's own visit counts, from the invite page or their card, and only once the page is on screen in a browser: the server's read records nothing, so mail scanners fetching a link don't count, and a host or admin looking at the page doesn't either.

**Nobody needs to sign up.** Public sign-up is closed (`emailAndPassword.disableSignUp`). An account exists the moment somebody's address is typed in: by a host inviting them or adding them to a group, by an admin on `/admin/users`, or by the person themselves on a share link. `findOrCreatePeople` in `packages/db/src/people.ts` writes the row directly, tokens included -- Better Auth's `createUser` is an admin endpoint and would refuse a host -- and keeps what was typed with the address. Wherever a host adds people the box is free-form, one person per line: `parseGuests` in `packages/db/src/addresses.ts` pulls out the address, a phone number and the name (split into first and last at the last word; one word, or a household like "The Parks", is a first name), and also reads a mail client's `"Linh" <linh@x.com>, "Bo" <bo@x.com>` on one line.

**A person's details are theirs once they sign in.** First and last name, mobile phone and mailing address live on the `user` row, one copy every host sees (`name` is kept as the two joined). Until somebody first signs in (`claimed_at`, stamped by the session hook in `packages/auth`), a host who has them in their address book may correct any of it on `/contacts`, one field at a time or in the edit pop-up, the only place a host sees an address. A pasted list only fills blanks on people who already exist. After the first sign-in only the person (on `/account`) and an admin (on `/admin/users`) can change it. Hosts never edit another host's or an admin's record. Changing an unclaimed person's email replaces both of their tokens; changing it to an address that is already somebody's moves that host's book entry and groups to that person instead.

**Every link in every email signs the reader in.** It carries their `link_token`, a bearer credential, which is why the emails say not to forward them. Cover photo URLs deliberately carry nothing. Passwords are optional: anyone can set one on `/account`, and "Email me a link" on `/login` sends a fresh link at most every ten minutes, saying the same thing whether or not the address exists.

Sessions last 180 days and roll forward. There is no session cookie cache: every request checks its session in D1, so signing out everywhere, a new sign-in link or a deactivation ends the person's other sessions at once. Every procedure that grants anything (`hostProcedure`, `adminProcedure`, event access) also re-reads the person from D1.

**Two switches, not states.** A person is `active` or `deactivated`; separately, they may be **unsubscribed** (`unsubscribed_at`, with a reason: self, bounce, spam, invalid).

- *Unsubscribed* stops the email and nothing else: they still sign in, and invitations still show up on the site and on the hosts' lists (marked "No email"). Set by the footer link, the account page, or Brevo's webhook; lifted from the account page or the footer's undo, which also lift Brevo's blocklist.
- *Deactivated* is the lockout, and only an admin sets or lifts it. It sets Better Auth's `banned` in the same statement (closing the password door), revokes every session, and makes emailed links land on `/login?error=revoked`. Nothing is deleted.
- *Deleted* is for good, and also admin only (People → Delete): the row goes, and D1's cascades take their invitations, answers, family membership, address-book entries, groups and sessions with it, so the address can come back later as a stranger. Events they own pass to the co-host who has hosted longest (if one may still host); events they host alone are deleted with them, and one guests are still expecting blocks the delete until it is canceled or given a co-host. The confirmation lists all of that first (`people.removal`). Brevo is not told: its blocklist keeps an address that unsubscribed or bounced unmailable if a host adds it again.

**The first account on an empty database** cannot come from the site. Write your own row, then click your own link:

```bash
# 1. Put yourself in, as an admin, with a token to get in with.
pnpm --filter web exec wrangler d1 execute DB --remote --command "insert into user (id, name, email, email_verified, role, status, source, link_token, unsubscribe_token) values (lower(hex(randomblob(16))), 'Your Name', 'you@example.com', 1, 'admin', 'active', 'admin', lower(hex(randomblob(16))), lower(hex(randomblob(16))))"

# 2. Read the token back.
pnpm --filter web exec wrangler d1 execute DB --remote --command "select link_token from user where email='you@example.com'"
```

Open `https://rsvp.botch.com/api/auth/link?k=<that token>`. Then make hosts from `/admin/users`. Drop `--remote` to do the same locally.

## Events, guests and the potluck

- **An event** (`event`) is a draft until a host sends it. A draft can be saved without a date; sending needs one. Dates are `YYYY-MM-DD` and times `HH:MM` on the site's clock (America/New_York, `packages/api/src/time.ts`). Its settings say what to ask (plus-ones up to N, kids, dietary notes, a note to the host), whether guests see each other's names, the potluck, the share link and the email schedule. A published event can be canceled (with an optional note to everyone still coming), and any event deleted for good, guest list, answers, potluck and pictures included. Any host may delete a draft; once it has gone out only the owner or an admin may (co-hosts can still cancel). Deleting one guests are still expecting cancels it first, with the same note and email, sent without its pictures since they are about to go (`callOff` in `packages/api/src/endings.ts`).
- **Details** come in two kinds. "The details" go wherever the invitation does: the invite page, the invitation and day-before emails, printed cards, and `{details}` on a designed card. "More details, on the invite page only" (`event.extra_details`) are shown only to guests who open the invite, under "Good to know": never emailed, printed or on the public share page, so a gate code or parking note stays with the people invited.
- **Hosts** are rows in `event_host`; the creator is `is_owner`. Co-hosts are added in the editor's "Hosts" step, by address or from the hosts in your address book, on a new event (added when the draft is first saved) or an existing one. They must already be hosts on the site -- an admin makes somebody a host on `/admin/users`.
- **The guest list** is `event_guest`: one row per person per event, and the invitation and the answer in one row -- `response` null means "no reply". `invited_at` records when their invitation went out; `source` says how they got on (typed by a host, from a group, or through the share link). Hosts add people on the editor or the guest list; nobody is emailed until the host presses Send, which mails everyone not yet invited, exactly once.
- **Answering** (`guests.respond`) saves the answer, the party (adults including the guest, clamped to the event's plus-ones; kids), dietary notes, the note and potluck picks in one go. Answers stay open until the party starts; the deadline is what the host asks for, not a lock. The numbers every page and email show come from `packages/api/src/headcount.ts`: households by answer, and people expected (adults and kids on every yes).
- **Paper invitations** are chosen per event while it is a draft (Email / Paper under "Who's invited"). The host can add guests by email or **by name alone** -- a name-only guest is a `user` with `no_email` and a unique placeholder address at `no-email.invalid`, never mailed and never shown -- and downloads a PDF of cards from the guest list: one guest's card, or everybody's in one file, at 5x7, letter, or half-letter two to a sheet. The PDF is built in the host's browser (`apps/web/src/lib/paper-pdf*.ts`; the Worker's CPU budget is far too small), loaded only when asked for. Each card's QR code is `/p/<event_guest.paper_token>`: a key per invitation, issued on first download and kept after, so printing again never breaks a mailed card; "New code" on a guest replaces it. Because the host holds these keys, a key **signs nobody in**: it opens that one invitation and answers it, and for anything else the guest signs in with their email. Keys do nothing on drafts or for deactivated people, and the old `/api/auth/paper?k=` codes on cards already printed forward to the new page. Until the host presses **Start emails**, a paper event sends guests nothing: no invitation, reminder, nudge, change or cancel notice (`emailsHeld` in `packages/api/src/events.ts`; the schedule holds too). Start emails sends the invitation to everyone with an address who has not already answered from their card, and from then on the event behaves like any other. Host alerts are never held, and friends a guest invites get email at once, since they have no card.
- **Guests bringing guests** is off by default. With "Guests can invite others" on, a guest the host chose -- typed in, or from one of the host's groups -- gets a "Bring someone" form on the invite page and may add up to the event's limit (default 3). Their friend goes on the list with `source = 'guest'` and `added_by` set, and gets the invitation at once, naming who brought them. People a guest adds, and people who came in on the share link, can never invite anyone: one level and no further. The rule is `canInviteOthers` in `packages/api/src/guest-invites.ts`; the limit is checked inside the INSERT, so two quick invites cannot slip past it. A guest can take back an invitation until it is answered; after that only a host removes it. The host's guest list and CSV say who added whom.
- **The potluck** is `potluck_item` (label, how many) and `potluck_claim` (one per guest per item). A claim is an `INSERT ... SELECT` that only writes while the item has room, so two guests taking the last slot cannot both get it; the loser is told.
- **The address book** (`contact`) is each host's own list of people: everybody they have put on one of their events or in a group, plus anyone they add on `/contacts`. It fills itself (`remember` in `packages/db/src/address-book.ts`, called wherever a host adds somebody), and migration 0013 backfilled it from past events and groups. When adding guests, the host can pick from it with a search box, alongside pasted addresses and groups; picks are checked against the caller's own book, so a guessed id adds nobody. Removing somebody from the book takes them out of that host's groups but not off any event. Friends a guest brings and share-link joiners are not the host's choices and do not land in the book.
- **Contact groups** (`contact_group`, `contact_group_member`) are made from the book: a person is ticked into one or more groups from their row on `/contacts`, and only somebody in the host's book can be put in their group. Adding a group to an event copies its members onto the list. Both book and groups are private to their owner. An admin can **share** a family with every host, or a group with the hosts they pick on `/admin/groups` (`contact_group_share`): those hosts may then add its members to their events from the picker (`pickable` in `packages/db/src/families.ts` replaces the book check for them), but only a group's owner or an admin edits it. A shared family or group is how a host gets people who are not in their own book.
- **Hosts can record answers.** The pencil on a guest row sets their answer (yes, maybe, can't, or back to no reply) and their adults and kids, for the guest who phoned it in. The host is not held to the event's plus-one limit, no host alert fires, and a "can't" drops their potluck claims as it would for the guest (`guests.setAnswer`).
- **The share link** `/i/<share_token>` is off by default. A stranger sees the teaser and types their address; `events.join` (rate-limited by IP with the `JOIN_LIMITER` binding, and per address by `link_sent_at`) emails them a sign-in link back to the same page, and landing there signed in puts them on the list. A host can make a new token, which kills the old link and nothing else.
- **Cover photos** are scaled down in the browser and stored in the `MEDIA` R2 bucket under a random key, served at `/api/covers/<key>` with immutable caching. A new photo gets a new key; the old object is deleted.
- **Invitation designs** are per event and open to every host: "Design it" in the editor's first step opens the designer (`/e/<id>/design`), a free canvas over a fixed-shape card (5x7 either way, square, 8x10, half-letter, letter) where text, uploaded images, shapes, stickers and, on paper events, the QR code are dragged, resized and turned, with a page theme (five colours, two fonts) for the rest of the guest page. Text can carry `{title}`, `{date}`, `{time}`, `{location}`, `{host}`, `{rsvp by}`, `{details}`, `{guest}`, `{first name}` and `{last name}`, filled from the event (and the guest's from the reader, or the addressee on paper); `{guest's}` and `{first name's}` are the name made possessive the way it is written (Josh’s, James’s, The Nguyens’), by `possessive` in `packages/design/src/placeholders.ts`. The document is `event_design` (JSON, validated by `@rsvp-site/design` on every save, versioned so a co-host's save is never silently overwritten); `event.design_on` says whether guests see it. One scene, laid out in `packages/design` with generated font metrics (line breaks and every glyph's position, kerning included), is drawn three ways: SVG on the page (laid out on the server), pdf-lib for paper (in the host's browser, with native gradients, a shared form XObject per card and an optional print-shop bleed with crop marks) and a canvas JPEG for email, link previews and the dashboard. That picture (`event.card_key`) bakes in the event's facts, so it is redrawn after design saves and fact changes, and by the guest list whenever `card_basis` says it is stale. Images live in R2 under `designs/<event id>/` (served at `/api/designs/...`, uploads never SVG), are pruned when unused for an hour, and go with the event. A paper event's design must carry a QR code to save, switch on or send.

The oRPC procedures are `account.*`, `events.*`, `designs.*`, `guests.*`, `contacts.*`, `people.*` and `mail.*` under `packages/api/src/routers`, built on `publicProcedure`, `protectedProcedure`, `personProcedure`, `hostProcedure` and `adminProcedure` from `packages/api/src/index.ts`. Event access is decided in one place, `accessTo` / `hostAccessTo` in `packages/api/src/events.ts`.

## Email

Brevo delivers; the app owns the list, the templates and the log.

- **Who gets it.** `listRecipients` in `packages/db/src/people.ts` is the one query behind every list send, and it never returns anybody deactivated or unsubscribed, whatever ids are asked for. Each person has an `unsubscribe_token` for the footer link and a `link_token` for the sign-in links.
- **How a link signs you in.** Every link in a list email points at `/api/auth/link?k=<link_token>&to=<path>`, a GET endpoint added by the `email-link` plugin in `packages/auth/src/link.ts`. It finds the person, marks the address verified, opens a session and redirects to `to`, checked by `safeReturnPath`. An unknown token lands on `/login?error=link`, a deactivated one on `/login?error=revoked`.
- **Answer buttons never answer.** Yes / Maybe / Can't in an email land on `/e/<id>?a=yes`, which shows that answer picked and waits for a tap. Mail clients prefetch link targets; a GET that saved would answer for people who never clicked. The unsubscribe footer works the same way: the GET shows a button, the POST acts.
- **What goes out.**
  - *Invite* -- when a host presses Send, to everyone on the list not yet invited.
  - *Deadline reminder*, *day before* -- from the cron; see "The email schedule".
  - *Nudge* -- a host pressing Nudge, to people with the invitation and no answer; each person at most once every twelve hours.
  - *Change of plans* -- when a sent event's date, time or place changes and "Tell guests about changes" is on, to everyone who has not said no. The editor says so on the button.
  - *Canceled* -- to everyone who has not said no, with the host's note.
  - *Host alert* / *host digest* -- to the event's hosts, for each reply or once a morning, per the event's setting.
  - *Share link* -- the sign-in link a stranger asked for on `/i/<token>`. Concrete URL, sent to one person.
  - *Welcome* -- an admin adding somebody or resending their link, or "Email me a link" on `/login`.
  - *Message* -- an admin writing to everybody on `/admin/email`, with "Send to me first".
  - *Account* -- Better Auth's password reset.
- **Look.** The site is dark; the email body is not. Gmail and Outlook rewrite dark backgrounds in their own dark modes, so emails get a plum band with the wordmark, the cover photo, lime buttons and a white body (`packages/email/src/render.ts`).
- **Sender.** `"Botch RSVP" <info@rsvp.botch.com>`, set in `packages/email/src/sender.ts`. The domain is authenticated in this site's own Brevo account, not pickup-bball's: that keeps the two sites' blocklists, webhooks and keys apart, since Brevo applies all three account-wide. Its DKIM records live in the `botch.com` Cloudflare zone, and Cloudflare Email Routing forwards replies to `info@` to a person.
- **Log.** Every list send writes one `email_send` row (kind, event, subject, recipient count, failures, Brevo message ids). `/admin/email` shows the last thirty.
- **Batching and personalisation.** One Brevo request carries up to 99 personalised copies (`messageVersions`). Each copy gets `params.name`, `params.unsubscribeUrl` and `params.key` -- the last turns the shared template's links into that one person's sign-in links. Without `BREVO_API_KEY` the email is printed instead, with the placeholders filled in from the first recipient so the link in the console is clickable.
- **Brevo's own unsubscribe.** Brevo adds its own `List-Unsubscribe` header to every email, so people can also stop the mail from their mail app. Brevo tells the app through the webhook at `/api/brevo/webhook` (`apps/web/src/server/brevo-webhook.ts`): unsubscribe, hard bounce, spam complaint and invalid address all unsubscribe the address with that reason -- never a deactivation.

Setting it up:

1. In Brevo, create a v3 API key (Account > SMTP & API > API keys).
2. Production: `pnpm --filter web exec wrangler secret put BREVO_API_KEY`.
3. Local sending (optional): put the same key in `apps/web/.dev.vars`.
4. The webhook: pick a random token, set it with `pnpm --filter web exec wrangler secret put BREVO_WEBHOOK_SECRET`, then register the webhook once:

   ```bash
   curl -H "api-key: $BREVO_API_KEY" -H "content-type: application/json" https://api.brevo.com/v3/webhooks \
     -d '{"url":"https://rsvp.botch.com/api/brevo/webhook","type":"transactional","events":["unsubscribed","hardBounce","spam","invalid"],"auth":{"type":"bearer","token":"<the token>"}}'
   ```

   Without the secret the route answers 404, so a missing webhook never breaks anything else.
5. To run the email schedule locally with the dev server running: `curl "http://localhost:3001/cdn-cgi/local/scheduled?cron=0+*+*+*+*"`. It runs at the real clock, so move an event's dates to make something due. **Leave `BREVO_API_KEY` unset while you do**, or the run mails everybody in the local database for real.

The templates and Brevo client in `packages/email` are pure functions with tests: `pnpm run test`.

Brevo also offers an MCP server for inspecting the account (senders, templates, delivery logs) from Claude Code. Register it once per machine, outside the repo, with an MCP token from the same API keys page:

```bash
claude mcp add --transport http --scope user brevo https://mcp.brevo.com/v1/brevo/mcp --header "Authorization: Bearer <MCP token>"
```

That registration is per machine, not per repo. On a machine where it already points at pickup-bball's Brevo account, it shows that account and not this one, so anything done through it changes the wrong site.

## The email schedule

Each event's own settings decide its automatic email. The half-hourly cron asks
`dueEmails` in `packages/api/src/schedule.ts` what each published event has
due, on the site's clock:

| Email | When | To |
|---|---|---|
| Deadline reminder | 10:00 AM, N days before the RSVP deadline (N per event, default 3) | invited, no answer |
| Day before | 10:00 AM the day before | yes and maybe |
| Host digest | 8:00 AM daily, through the morning after the party, if the event asks for it | the hosts, with the replies since the last one |

Rules, all unit-tested in `packages/api/src/schedule.test.ts`:

- **A stamp means resolved, not sent.** Each email stamps a column on `event` when it is handled. One whose moment has passed -- the deadline went by, the party started, or the event was only published after the reminder was due (so the invitation itself just went out) -- is stamped without sending, so the job does not retry it every half hour. `email_send` is the record of what went out.
- **Moving the date or the deadline re-arms** the reminders that belonged to the old one.
- **Read, claim, send.** `jobs/event-mail.ts` reads who it would go to, claims the stamp with `UPDATE ... WHERE col IS NULL` (`meta.changes === 1` is the lock), sends, and gives the stamp back if every batch failed. The digest repeats, so its claim is "older than this morning's slot" instead. Two overlapping passes cannot both send.

## Database changes

1. Edit the schema in `packages/db/src/schema`.
2. Generate a migration: `pnpm run db:generate`. This writes SQL into `packages/db/src/migrations`, which is what wrangler applies.
3. Apply it locally with `pnpm run db:migrate:local`, and to production with `pnpm run db:migrate:remote`.

Inspect the local database with `pnpm --filter web exec wrangler d1 execute DB --local --command "select * from user"`.

## Deploying to Cloudflare

One-time setup:

1. Log in: `pnpm --filter web exec wrangler login`.
2. Create the database: `pnpm --filter web exec wrangler d1 create rsvp-site-db` and paste the returned id into `database_id` in `apps/web/wrangler.jsonc`.
3. Set the auth secret: `pnpm --filter web exec wrangler secret put BETTER_AUTH_SECRET`.
   Set the Brevo key and webhook token the same way: `pnpm --filter web exec wrangler secret put BREVO_API_KEY` and `... put BREVO_WEBHOOK_SECRET` (see "Email").
4. Create the cover photo bucket: `pnpm --filter web exec wrangler r2 bucket create rsvp-site-media`.
5. Apply migrations to production: `pnpm run db:migrate:remote`.
6. Deploy: `pnpm run deploy`.
7. Set `BETTER_AUTH_URL` in `apps/web/wrangler.jsonc` `vars` to the URL wrangler printed (or your custom domain) and deploy again.
8. Get yourself an account: on a brand new database, follow "The first account on an empty database" in "Who sees what". Otherwise ask an admin to add you on `/admin/users` and click the link they send you.

### Automatic deploys

`.github/workflows/deploy.yml` runs on every push and pull request. It lints with Biome, runs the unit tests, typechecks and builds. On pushes to `main` it then applies pending D1 migrations and deploys the Worker with Cloudflare's `wrangler-action`.

It needs one repository secret, `CLOUDFLARE_API_TOKEN`: a Cloudflare API token created from the "Edit Cloudflare Workers" template with **D1: Edit** and **Workers R2 Storage: Edit** added. Set it with `gh secret set CLOUDFLARE_API_TOKEN` or in the repository's Actions secrets. Until the secret exists the deploy job skips with a warning instead of failing. The account id is in `apps/web/wrangler.jsonc`, so no account secret is needed.

You can still deploy by hand with `pnpm run deploy`.

## Project Structure

```
rsvp-site/
├── apps/
│   └── web/         # Fullstack app: TanStack Start pages + Hono API under /api (one Worker)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # oRPC router / business logic
│   ├── auth/        # Better Auth configuration
│   ├── db/          # Drizzle schema (people, events, guests, potluck, contacts, designs, email_send), roles and D1 migrations
│   ├── design/      # Invitation designs: schema, fonts and metrics, text layout, the scene, theme, templates
│   ├── email/       # Brevo client, email templates and their tests
│   └── env/         # Typed access to Worker env and bindings
```

## Available Scripts

- `pnpm run dev`: Start the dev server (pages and API) at http://localhost:3001
- `pnpm run build`: Build the Worker and static assets
- `pnpm run check-types`: Check TypeScript types across the workspace
- `pnpm run check`: Run Biome formatting and linting
- `pnpm run test`: Run the unit tests (email templates, Brevo client, address parsing, roles, headcount, the schedule's timezone maths, event rules, and the invitation designs: validation, text layout, the scene, the editor)
- `pnpm run db:generate`: Generate a D1 migration from the Drizzle schema
- `pnpm run db:migrate:local`: Apply migrations to the local D1 database
- `pnpm run db:migrate:remote`: Apply migrations to the production D1 database
- `pnpm run deploy`: Build and deploy the Worker with wrangler
