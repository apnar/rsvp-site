# rsvp-site

Botch RSVP: party invitations with RSVPs, at https://rsvp.botch.com. A host
makes an event (cover photo, when and where, what to ask, a potluck), invites
people by email or from a contact group, and watches the answers come in --
yes, maybe or can't, with plus-ones, kids, dietary notes and a note to the
host.

It started as a copy of [pickup-bball](https://github.com/apnar/pickup-bball), the app behind a weekly basketball run, and the bones are the same: one Cloudflare Worker, D1, R2, Better Auth with emailed sign-in links, and Brevo for the mail. The model on top is its own: per-event guest lists, three roles, and emails scheduled from each event's own dates.

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Start, Hono, ORPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Start** - SSR framework with TanStack Router
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives and the After Dark design tokens live in `packages/ui`
- **Hono** - API routes, served from inside the TanStack Start Worker
- **oRPC** - End-to-end type-safe APIs with OpenAPI integration
- **Cloudflare Workers** - Hosting for the whole site, single Worker
- **Drizzle** - TypeScript-first ORM
- **Cloudflare D1** - SQLite database
- **Authentication** - Better-Auth
- **Email** - Brevo transactional API, called with plain `fetch` from `packages/email`
- **Turborepo** - Optimized monorepo build system
- **Biome** - Linting and formatting

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
  - `/api/reference` - OpenAPI reference
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
| `admin` | everything a host can, plus see and manage every event, add people, set roles, deactivate |

Roles live in `user.role` (null reads as `user`) and are read through `roleOf` / `canHost` / `isAdmin` in `packages/db/src/roles.ts`, which the web app and the API share. Better Auth's admin plugin only knows `admin` and `user`, so roles are written by `people.setRole`, not by its `setRole`.

- **Strangers** get the landing page, and a share link's teaser if they have one: cover, title, date and the host line. Never the address, the details or who is coming.
- **Guests** see an event only if they are on its list, and never a draft. A wrong id and an event that is not yours answer the same "no such event", so ids cannot be probed. Other guests' names show only when the host leaves "Show who's coming" on; counts always show; notes, dietary info and addresses are for hosts.
- **Hosts** see and run the events they host -- the creator (owner) and any co-hosts, who must themselves be hosts. Admins see everything.

**Nobody needs to sign up.** Public sign-up is closed (`emailAndPassword.disableSignUp`). An account exists the moment somebody's address is typed in: by a host inviting them or adding them to a group, by an admin on `/admin/users`, or by the person themselves on a share link. `findOrCreatePeople` in `packages/db/src/people.ts` writes the row directly, tokens included -- Better Auth's `createUser` is an admin endpoint and would refuse a host -- and keeps the name from a pasted `"Linh Nguyen" <linh@x.com>`.

**Every link in every email signs the reader in.** It carries their `link_token`, a bearer credential, which is why the emails say not to forward them. Cover photo URLs deliberately carry nothing. Passwords are optional: anyone can set one on `/account`, and "Email me a link" on `/login` sends a fresh link at most every ten minutes, saying the same thing whether or not the address exists.

Sessions last 180 days and roll forward. The session cookie caches the user for five minutes, so a role change takes up to five minutes to show in the nav -- but every procedure that grants anything (`hostProcedure`, `adminProcedure`, event access) re-reads the person from D1.

**Two switches, not states.** A person is `active` or `deactivated`; separately, they may be **unsubscribed** (`unsubscribed_at`, with a reason: self, bounce, spam, invalid).

- *Unsubscribed* stops the email and nothing else: they still sign in, and invitations still show up on the site and on the hosts' lists (marked "No email"). Set by the footer link, the account page, or Brevo's webhook; lifted from the account page or the footer's undo, which also lift Brevo's blocklist.
- *Deactivated* is the lockout, and only an admin sets or lifts it. It sets Better Auth's `banned` in the same statement (closing the password door), revokes every session, and makes emailed links land on `/login?error=revoked`. Nothing is deleted.

**The first account on an empty database** cannot come from the site. Write your own row, then click your own link:

```bash
# 1. Put yourself in, as an admin, with a token to get in with.
pnpm --filter web exec wrangler d1 execute DB --remote --command "insert into user (id, name, email, email_verified, role, status, source, link_token, unsubscribe_token) values (lower(hex(randomblob(16))), 'Your Name', 'you@example.com', 1, 'admin', 'active', 'admin', lower(hex(randomblob(16))), lower(hex(randomblob(16))))"

# 2. Read the token back.
pnpm --filter web exec wrangler d1 execute DB --remote --command "select link_token from user where email='you@example.com'"
```

Open `https://rsvp.botch.com/api/auth/link?k=<that token>`. Then make hosts from `/admin/users`. Drop `--remote` to do the same locally.

## Events, guests and the potluck

- **An event** (`event`) is a draft until a host sends it. A draft can be saved without a date; sending needs one. Dates are `YYYY-MM-DD` and times `HH:MM` on the site's clock (America/New_York, `packages/api/src/time.ts`). Its settings say what to ask (plus-ones up to N, kids, dietary notes, a note to the host), whether guests see each other's names, the potluck, the share link and the email schedule. A published event can be canceled (with an optional note to everyone still coming) and a draft or canceled one deleted.
- **Hosts** are rows in `event_host`; the creator is `is_owner`. Co-hosts are added by address on the editor and must already be hosts.
- **The guest list** is `event_guest`: one row per person per event, and the invitation and the answer in one row -- `response` null means "no reply". `invited_at` records when their invitation went out; `source` says how they got on (typed by a host, from a group, or through the share link). Hosts add people on the editor or the guest list; nobody is emailed until the host presses Send, which mails everyone not yet invited, exactly once.
- **Answering** (`guests.respond`) saves the answer, the party (adults including the guest, clamped to the event's plus-ones; kids), dietary notes, the note and potluck picks in one go. Answers stay open until the party starts; the deadline is what the host asks for, not a lock. The numbers every page and email show come from `packages/api/src/headcount.ts`: households by answer, and people expected (adults and kids on every yes).
- **The potluck** is `potluck_item` (label, how many) and `potluck_claim` (one per guest per item). A claim is an `INSERT ... SELECT` that only writes while the item has room, so two guests taking the last slot cannot both get it; the loser is told.
- **Contact groups** (`contact_group`, `contact_group_member`) belong to one host and are private to them (and admins). Adding a group to an event copies its members onto the list.
- **The share link** `/i/<share_token>` is off by default. A stranger sees the teaser and types their address; `events.join` (rate-limited by IP with the `JOIN_LIMITER` binding, and per address by `link_sent_at`) emails them a sign-in link back to the same page, and landing there signed in puts them on the list. A host can make a new token, which kills the old link and nothing else.
- **Cover photos** are scaled down in the browser and stored in the `MEDIA` R2 bucket under a random key, served at `/api/covers/<key>` with immutable caching. A new photo gets a new key; the old object is deleted.

The oRPC procedures are `account.*`, `events.*`, `guests.*`, `contacts.*`, `people.*` and `mail.*` under `packages/api/src/routers`, built on `publicProcedure`, `protectedProcedure`, `personProcedure`, `hostProcedure` and `adminProcedure` from `packages/api/src/index.ts`. Event access is decided in one place, `accessTo` / `hostAccessTo` in `packages/api/src/events.ts`.

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
│   ├── db/          # Drizzle schema (people, events, guests, potluck, contacts, email_send), roles and D1 migrations
│   ├── email/       # Brevo client, email templates and their tests
│   └── env/         # Typed access to Worker env and bindings
```

## Available Scripts

- `pnpm run dev`: Start the dev server (pages and API) at http://localhost:3001
- `pnpm run build`: Build the Worker and static assets
- `pnpm run check-types`: Check TypeScript types across the workspace
- `pnpm run check`: Run Biome formatting and linting
- `pnpm run test`: Run the unit tests (email templates, Brevo client, address parsing, roles, headcount, and the schedule's timezone maths)
- `pnpm run db:generate`: Generate a D1 migration from the Drizzle schema
- `pnpm run db:migrate:local`: Apply migrations to the local D1 database
- `pnpm run db:migrate:remote`: Apply migrations to the production D1 database
- `pnpm run deploy`: Build and deploy the Worker with wrangler
