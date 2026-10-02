# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is, and where it stands

rsvp-site is meant to become a party/event invitation and RSVP site, roughly
in the spirit of Evite, at https://rsvp.botch.com. It was copied on 2026-10-02
from pickup-bball (`~/src/pickup-bball`, github `apnar/pickup-bball`), the app
behind a weekly basketball run. The history starts fresh; pickup-bball's
`git log` is still the design record for the inherited code.

**Only the words have changed so far.** Visible copy says event, venue,
guest, host and plus-one (game, gym, player, Sean and guest before). The
model underneath is still the inherited one: one standing guest list
(`user`), recurring `game`s at `gym`s, the `CONFIRM_AT` / `PLAY_AT`
thresholds and fixed-clock stages in `cycle.ts`, permits, and gym money.
Identifiers, tables, routes (`/rsvp/$gameId`, `/admin/gyms`) and the
migrations are unrenamed on purpose, so the schema is the one the code was
tested against. The architecture notes below describe that model as it is.
**The next piece of work** is to reshape it into per-event invitations:
events with their own guest lists, hosts and plus-ones, and an email
schedule tied to each event's start. That means dropping or reworking the
thresholds, permits and contributions, and renaming game/gym in the schema.
Plan it as its own change.

A known wrinkle: the cycle still calls its verdict at a fixed 7:30 PM on the
day. A verdict due after the start is resolved silently, so an event starting
before 7:30 never gets its on/off email. That is why `DEFAULT_START_TIME` in
`apps/web/src/content/run.ts` is 20:00, and it goes away with the reshape.

### Infrastructure

| What | Value |
|---|---|
| Worker | `rsvp-site`, custom domain `rsvp.botch.com` (botch.com zone); `rsvp-site.jlukens.workers.dev` 301s to it |
| D1 | `rsvp-site-db`, id `d0cd9e71-cbed-41f0-bb6a-667c63bfdeb3`, migrations 0000-0009 applied |
| R2 | `rsvp-site-permits` |
| Secrets set | `BETTER_AUTH_SECRET`, `BREVO_WEBHOOK_SECRET` |
| Secrets not yet set | `BREVO_API_KEY`, so production logs mail instead of sending it |
| GitHub | `apnar/rsvp-site`, public; CI `CLOUDFLARE_API_TOKEN` not yet set, so the deploy job skips |
| Sender | `info@rsvp.botch.com`, in this site's own Brevo account, which is not pickup-bball's |

The Cloudflare account (`b38725df...`) is shared with pickup-bball and other
sites. Everything else is separate. Brevo applies blocklists and webhooks
across a whole account, so sharing one would let an unsubscribe on one site
silence the other.

Private local files in `~/.config/rsvp-site/` (mode 600, never commit or
print them): `brevo-webhook-secret` (the value set on the Worker),
`admin-link` (the first admin's sign-in link), and, once the user provides
them, `brevo-key` and possibly `cf-dns-token`. Read them into commands with
`$(cat ...)` and never echo them.

The first admin is `jlukens@botch.com`, inserted by SQL into the empty D1.

### Setup still to do

1. **Brevo** (needs `~/.config/rsvp-site/brevo-key` from the user's new
   account):
   - Set the key on the Worker:
     `tr -d '\n' < ~/.config/rsvp-site/brevo-key | wrangler secret put BREVO_API_KEY`.
   - Register the domain: `POST https://api.brevo.com/v3/senders/domains`
     with `{"name":"rsvp.botch.com"}`. The response lists the DNS records.
   - Add those DNS records (step 2), then
     `PUT /v3/senders/domains/rsvp.botch.com/authenticate`.
   - Create the sender `info@rsvp.botch.com`, named "RSVP".
   - Register the webhook with the curl in README "Email", using URL
     `https://rsvp.botch.com/api/brevo/webhook` and the token from
     `~/.config/rsvp-site/brevo-webhook-secret`.
2. **DNS** in the botch.com zone:
   - Replace the existing TXT `brevo-code:392afc66...` on `rsvp.botch.com`.
     It belongs to pickup-bball's Brevo account (moco-pickup.com has the same
     code).
   - Add the new account's brevo-code, the DKIM records
     (`brevo1/brevo2._domainkey.rsvp`) and `_dmarc.rsvp` (`p=none`).
   - The wrangler OAuth login has only `zone (read)`, so use a DNS-edit token
     in `~/.config/rsvp-site/cf-dns-token` if there is one. Otherwise give
     the user the exact records to add in the dashboard.
3. **Replies:** Cloudflare Email Routing for the `rsvp.botch.com` subdomain,
   forwarding `info@` to `jlukens@botch.com`. The wrangler login has
   `email_routing (write)`.
4. **CI:** the user runs
   `gh secret set CLOUDFLARE_API_TOKEN -R apnar/rsvp-site` with a token from
   the "Edit Cloudflare Workers" template plus D1 Edit and R2 Storage Edit.
   Then confirm that a push to `main` runs the deploy job green.
5. **Verify:**
   - Brevo shows the domain authenticated.
   - "Send to me first" on `/admin/email` arrives from `info@rsvp.botch.com`
     with DKIM and DMARC pass.
   - A reply reaches `jlukens@botch.com`.

### Don't cross the streams

- The Brevo MCP server registered on this machine belongs to
  **pickup-bball's** Brevo account. Never use it here. Use curl against
  `api.brevo.com` with `-H "api-key: $(cat ~/.config/rsvp-site/brevo-key)"`.
- Before any `wrangler ... --remote` command, run it from `~/src/rsvp-site`
  and check that `apps/web/wrangler.jsonc` says `rsvp-site` /
  `rsvp-site-db`. The copy started out pointing at pickup-bball's production
  D1 id.

## Commands

pnpm + Turborepo. Run these from the repo root.

```bash
pnpm install
pnpm run dev              # dev server (pages + API) at http://localhost:3001
pnpm run build            # vite build -> Worker bundle + assets
pnpm run check            # biome check --write .  (format + lint + organize imports)
pnpm exec biome ci .      # what CI runs; stricter than check (lints SVGs too)
pnpm run check-types      # tsc --noEmit across the workspace
pnpm run test             # vitest run in packages/db, packages/email, packages/api
pnpm run deploy           # build + wrangler deploy (needs a TTY; see below)
```

`pnpm run deploy` and the `db:migrate:*` scripts go through turbo, which
marks those tasks interactive and refuses them without a terminal UI (so they
fail from Claude's shell). Run the underlying commands from `apps/web`:
`pnpm run deploy` there (`vite build && wrangler deploy`), and
`pnpm exec wrangler d1 migrations apply DB --local` or `--remote`.

Typecheck needs a build first: `apps/web/src/routeTree.gen.ts` is generated by the
TanStack Start Vite plugin and gitignored, so on a fresh clone run
`pnpm --filter web build` before `pnpm run check-types` (CI does exactly this).

Single test file / single test:

```bash
pnpm --filter @rsvp-site/email exec vitest run src/links.test.ts
pnpm --filter @rsvp-site/db exec vitest run -t "effectiveStatus"
```

Only `packages/db`, `packages/email` and `packages/api` have tests — pure
functions (templates, Brevo request shaping, link paths, status arithmetic,
the RSVP cycle's timezone and stage maths). Nothing in the test run touches D1
or the network. `packages/api` has no `check-types` script: adding one surfaces
a pre-existing `File`/`Blob` mismatch in `routers/permits.ts` under the Workers
lib. The `apps/web` build typechecks that source anyway.

Database:

```bash
pnpm run db:generate       # drizzle-kit generate -> packages/db/src/migrations
pnpm run db:migrate:local  # apply to the local D1 under apps/web/.wrangler
pnpm run db:migrate:remote # apply to production
pnpm --filter web exec wrangler d1 execute DB --local --command "select * from user"
```

Exercise the cron handler against the running dev server:

```bash
curl "http://localhost:3001/cdn-cgi/local/scheduled?cron=0+*+*+*+*"
```

Local setup needs `apps/web/.dev.vars` (copy `.dev.vars.example`, set a random
`BETTER_AUTH_SECRET`). Leave `BREVO_API_KEY` unset locally: the mailer then prints
each email to the dev console with the placeholders filled in from the first
recipient, so the sign-in link in the log is clickable.
Here `.dev.vars` was created without one, and the local D1 holds no real
people. If a key is ever added, strip it and restart before exercising any
send, and check first that `mail.status` reports `dryRun: true`. Otherwise a
local "test" send is a real one to everybody on the list.

## Architecture

One Cloudflare Worker serves everything. `apps/web` is a TanStack Start app built
with the Cloudflare Vite plugin; `apps/web/src/server.ts` is the Worker module
(custom TanStack server entry + the `scheduled` handler + a 301 redirect of every
non-canonical host to `BETTER_AUTH_URL`). A Hono app (`apps/web/src/server/app.ts`)
is mounted at `/api/*` by the catch-all route `apps/web/src/routes/api/$.ts`, so
pages and API share an origin: no CORS, ordinary same-site cookies.

Packages (all consumed as raw TypeScript source via `exports` — no build step for
libraries; only `apps/web` builds):

- `packages/db` — Drizzle schema (`src/schema/*`), D1 migrations, and
  `src/people.ts`, which owns every read and write of a person's state.
- `packages/auth` — Better Auth factory (`createAuth()`) plus the custom
  `email-link` plugin in `src/link.ts`.
- `packages/api` — oRPC routers (`src/routers/*`), shared business logic
  (`games.ts`, `mail.ts`, `run.ts`), and the cron job in `src/jobs/reminders.ts`.
- `packages/email` — pure template/Brevo code (`src/index.ts`) plus
  `src/worker.ts`, the only file there that touches the Worker env.
- `packages/env` — `env` re-exported from `cloudflare:workers`; the binding types
  in `env.d.ts` must be kept in sync with `apps/web/wrangler.jsonc`.
- `packages/ui` — shared shadcn/base-ui primitives and the design tokens.

Everything is constructed per request: `createDb()`, `createAuth()`,
`getMailer()`. There are no module-level singletons holding env, because
`cloudflare:workers` env is only valid inside a request.

### Request paths

- Browser → `/api/rpc` via the oRPC client in `apps/web/src/utils/orpc.ts`.
  That file is isomorphic: during SSR it calls `createRouterClient(appRouter)`
  directly (no HTTP hop), in the browser it uses an `RPCLink`.
- oRPC procedures come from `packages/api/src/index.ts`:
  `publicProcedure` / `protectedProcedure` / `adminProcedure`. `games.*` and
  `rsvp.*` reads are protected on purpose — a stranger must not learn the gym
  address or the tip-off time. `gyms.*` and `permits.*` are admin-only; players
  see a gym only through the game it is attached to. `people.roster` is the
  player-facing view of the `user` table and returns strictly less than the
  admin `people.list` — no addresses, tokens, or break reasons.
- The session is read once in `apps/web/src/routes/__root.tsx` `beforeLoad`
  (through the `getUser` server function) and flows down as router context.
  `routes/_auth/route.tsx` and `routes/_admin/route.tsx` are the guards.
- The half-hourly Cron Trigger calls `runRsvpCycle` and `sweepExpiredSuspensions`.

### Gyms, games and permits

`gym` is the one place a court is written down (name, address, and the parking
/ which-door notes). `game.gym_id` is NOT NULL with `on delete restrict`, so a
game always has a gym and a gym with games cannot be deleted — `gyms.remove`
counts the games first and says so in words rather than letting D1 answer with
a constraint error. `decorateGame` joins the gym with `innerJoin` for the same
reason, and derives `location` (`"Name, Address"`) so the email templates keep
taking one string.

Permit-to-gym coverage is many-to-many in `permit_gym`, written by
`setCoverage` in `routers/permits.ts` as delete-then-insert. It is paperwork
only: it sorts the permit dropdown when booking and never gates anything.

### The RSVP cycle

`packages/api/src/cycle.ts` is the single source of truth for the schedule and
the thresholds (`CONFIRM_AT` 10, `PLAY_AT` 8). The job reads it, `/admin/cycle`
renders the same array as prose, so the documentation cannot drift. Keep that
file free of drizzle and `cloudflare:workers` — the web app bundles it.

- `jobs/plan.ts` is a **pure** `planStage()`: given stamps and a clock it says
  which stage to run. Its rules (opening call never skipped, one stage per pass
  and it is the latest due, 90-minute cooldown that the verdict ignores) are
  the interesting part and are unit-tested without a database.
- `jobs/rsvp-cycle.ts` executes: read → decide → claim → send, in that order,
  so a stage that turns out to have nothing to say is never recorded as an
  email. The claim is a conditional `UPDATE ... WHERE col IS NULL` with
  `result.meta.changes === 1`.
- **A stage stamp means resolved, not sent.** Skipped stages stamp too, or the
  job retries them every half hour. `email_send` is the record of real sends.
- `jobs/stage-render.ts` is shared by the job and the admin preview, so a
  preview cannot show an email different from the one that goes out.
- The tenth yes fires stage 03 inline from the rsvp mutations *and* from the
  cron. The shared claim makes double-sending impossible; nothing plumbs an
  `ExecutionContext` to oRPC, so it is awaited rather than deferred.
- `runInstant(date, time)` in `run.ts` converts the gym's wall clock to a UTC
  instant with a two-pass offset fix. That second pass is what survives the
  week after a DST switch, when the evening-before call and the game itself sit
  on different offsets. Tested; do not "simplify" it to one pass.
- **Stage 01 snapshots the roster** into `game_invite` before the ask goes
  out -- one row per person still in the group, `on_break` for the ones it
  skipped. `user` keeps one status and no history, so this is the only thing
  that can still tell a break from silence months later, and the "Last 10"
  column on /admin/users counts against it (`api/src/responses.ts` for the
  arithmetic, `api/src/invites.ts` for the reading and writing). The insert is
  `on conflict do nothing`: a send Brevo rejects outright gives the stage back
  and the next pass comes through again. A game whose call never went out has
  no rows, which is right -- nobody was asked, so nobody's record moves.
- Every link in a cycle email lands on `/rsvp/$gameId`, which **reads and does
  not write**. Mail clients prefetch link targets — the same reason
  `server/unsubscribe.ts` stopped acting on a GET.

### Gym money

`contribution_call` is one ask (subject, body, whole-dollar `amount`, one-line
`instructions`); `contribution` is its ledger, one row per person billed, with
`status` unpaid / paid / excused. `packages/db/src/contributions.ts` owns every
read and write, and the pure `tally` / `tallyLine` there are what the admin
page and the history show. Things that are easy to get wrong:

- **The ledger is a snapshot** of `listRecipients(db, "active")` at send time,
  never a live view of the roster. Reminders go to unpaid ∩ active, computed
  the same way in the preview count and in `sendToList`'s `onlyPersonIds`, so
  the number on the button is the number that gets mail.
- **One open call at a time** (`closed_at IS NULL`). The router refuses in
  words first; `contribution_call_open_uidx` is a partial unique index on the
  *expression* `(closed_at is null)` for the double-click the words miss. It
  cannot be on the column: NULLs are distinct in a unique index.
- `sendCall` is read → decide → claim → send: the call and its ledger go in
  (one `db.batch`, chunked twenty rows a statement for D1's parameter cap)
  *before* the email leaves, and a send that never left discards the call.
  The other order asks people for money nothing tracks. `send_id` points at
  the `email_send` row, which stays the record of what went out.
- `contributions.mine` is the only player read and returns the caller's own
  row or null. Both emails link to `/dashboard`, a GET that writes nothing;
  there is no "mark me paid" link and there never can be.
- `packages/api/src/contributions-render.ts` reaches `siteUrl()`, so the web
  app must not import it; stock copy reaches the page via `contributions.current`.

### The one-table people model

`user` is simultaneously the roster, the mailing list and the accounts. A person
is `active`, `suspended` or `deactivated`; `packages/db/src/people.ts` is the only
place that decides what that means. Things that are easy to get wrong:

- A suspension with `suspended_until` in the past **is already over**.
  Use `effectiveStatus` / `activeWhere` / `audienceWhere`, never a bare
  `status = 'active'`. The cron sweep is cosmetic housekeeping.
- `banned` is a mirror of `status = 'deactivated'`, written in the same statement
  so Better Auth blocks the password door. It is nullable (migration 0000 lacked
  NOT NULL) — never compare it with `= 0`.
- Self-service paths (`unsuspend`, the unsubscribe form, the Brevo webhook) must
  never touch a deactivated row; the guards are in the `where` clauses.
- The session cookie caches the user for five minutes. Anything that grants
  access to a spot or the gym address re-reads D1 (`findPersonState`) rather than
  trusting `session.user`. A role changed by SQL takes up to five minutes to show.
- `link_token` and `unsubscribe_token` are stamped by the Better Auth
  `databaseHooks.user.create.after` hook (`stampTokens`), so no code path can
  create a person with no way in. Better Auth drops unknown fields on insert,
  which is why this is a hook and not part of the insert.

### Email and sign-in links

`link_token` is a bearer credential: every link in every list email is
`/api/auth/link?k=<token>&to=<path>`, and clicking it opens a session. Never put
one on a URL meant to be shown around (the permit PDF URL deliberately carries
nothing), and never hand it to Better Auth as an additional user field — those get
base64'd into a browser-readable cookie. `safeReturnPath` sanitizes `to`.

List sends go through `packages/api/src/mail.ts` → `Mailer.sendList`, which
batches up to 99 personalised copies per Brevo request using `messageVersions`;
templates therefore contain the `PARAM` placeholders from
`packages/email/src/render.ts` (`{{ params.key }}`, `{{ params.unsubscribeUrl }}`)
rather than concrete URLs, and their output must never be run through
`escapeHtml`. Every list send writes one `email_send` row. Announcement and reminder always go to the `active` audience only.

## Conventions

- Biome: tabs, double quotes, `preset: recommended`, organize-imports on. Run
  `pnpm run check` while working, and `pnpm exec biome ci .` before pushing:
  that is what CI runs, and it is stricter -- it lints files `check` lets
  through (an SVG in `public/` needs a `<title>`, for one).
- TypeScript is strict with `noUncheckedIndexedAccess`, `noUnusedLocals` and
  `verbatimModuleSyntax` (use `import type`).
- Imports: `@/*` inside `apps/web/src`, `@rsvp-site/<pkg>` across packages.
  Subpath imports are the norm (`@rsvp-site/db/people`,
  `@rsvp-site/ui/components/button`).
- Design system lives in `packages/ui/src/styles/globals.css`: Barlow Condensed
  headings over Barlow, steel-blue on a light ground, square corners
  (`--radius: 0px`), hairline `border-divider`. Use the token utilities
  (`bg-ground`, `text-ink`, `text-steel-700`, `font-heading`, `.kicker`, `.tnum`)
  rather than raw Tailwind colors, and the `<Blueprint>` component rather than
  hand-writing the framed/corner-marked look.
- Standing copy and defaults (site name, tip-off, rules, conditions) live in
  `apps/web/src/content/run.ts`; the numbers the API needs
  (`CAPACITY`, `RUN_TIMEZONE`, date/time formatting) live in
  `packages/api/src/run.ts`.
- Game `date` is a `YYYY-MM-DD` string and `start_time` an `HH:MM` string, both in
  `America/New_York`. Compare with `todayInRunTimezone()`, not with `Date`.
- The countdown is the app's only ticking UI. Seed its clock from the payload's
  `now`, never `Date.now()` in render or a `useState` initializer, or the SSR
  markup and the hydration markup disagree. Every `toLocale*` call on a date
  passes `timeZone: "America/New_York"` for the same reason.
- **Drizzle only writes table-qualified column names when a query has a join.**
  A correlated subquery inside a `sql` template on a single-table `from` comes
  out as `where "gym_id" = "id"` — both resolve against the subquery's own
  table, and it silently returns zeros. Either join and aggregate (what
  `gyms.list` does) or make sure the outer query already has a join (what the
  `inCount` subquery in `games.ts` relies on).
- Comments here explain *why* a thing is the way it is (the security or
  operational reason), not what the code does. Match that when editing.
- **Commit and push straight to `main`.** No feature branches, no pull
  requests — one person maintains this and a review queue of one is just a
  delay. Nothing else looks at the change before it ships, so `pnpm exec biome ci .`,
  `pnpm run test` and a build are the gate; run them first.
- Commit messages are a declarative sentence ("The roster is the people who
  actually play"), then prose about *why*, in the same voice as the code
  comments. `git log` is the design record here; match it.

The README is unusually detailed and current — check it before asking about
deployment, Brevo setup, admin bootstrapping, or who-sees-what.
