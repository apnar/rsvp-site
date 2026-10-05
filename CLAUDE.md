# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is, and where it stands

rsvp-site is Botch RSVP, a party invitation and RSVP site in the spirit of
Evite, at https://rsvp.botch.com. It was copied on 2026-10-02 from
pickup-bball (`~/src/pickup-bball`, github `apnar/pickup-bball`), the app
behind a weekly basketball run, and reshaped the same day into per-event
invitations (migration 0010). pickup-bball's `git log` is still the design
record for the infrastructure it kept: the email-link sign-in, the Brevo
batching, the unsubscribe and webhook handling, the claim-before-send
pattern.

The look is "After Dark" from a Claude Design export (`~/rsvp.zip`): plum
night, lime and hot pink, Unbounded over Manrope, pills. Its screens map to
routes: landing `/`, guest invite `/e/$eventId`, host dashboard `/events`,
guest list `/e/$eventId/guests`, create/edit `/e/new` and `/e/$eventId/edit`.

### Infrastructure

| What | Value |
|---|---|
| Worker | `rsvp-site`, custom domain `rsvp.botch.com` (botch.com zone); `rsvp-site.jlukens.workers.dev` 301s to it |
| D1 | `rsvp-site-db`, id `d0cd9e71-cbed-41f0-bb6a-667c63bfdeb3`, migrations 0000-0023 applied (CI applies new ones on push) |
| R2 | `rsvp-site-media` (binding `MEDIA`): cover photos under `covers/`, design images and card pictures under `designs/<event id>/`, profile pictures under `avatars/` |
| Rate limits | `JOIN_LIMITER`, namespace 4207, 5 a minute per IP on the share-link email form; `AUTH_LIMITER`, namespace 4208, 10 a minute per path and IP on password sign-in, resets, the `/link` sign-in and "email me my link", and per person on guests inviting friends |
| Secrets | `BETTER_AUTH_SECRET`, `BREVO_WEBHOOK_SECRET`, `BREVO_API_KEY`, `TELNYX_API_KEY` |
| GitHub | `apnar/rsvp-site`, public; CI secret `CLOUDFLARE_API_TOKEN` is set, so a push to `main` migrates and deploys |
| Sender | `"Botch RSVP" <info@rsvp.botch.com>`, in this site's own Brevo account ("Botch Systems"), which is not pickup-bball's. The domain is authenticated (DKIM `brevo1`/`brevo2._domainkey.rsvp`, brevo-code TXT on `rsvp`), and DMARC passes under botch.com's own `p=none` |
| Brevo webhook | id 2217340, posting to `https://rsvp.botch.com/api/brevo/webhook` |
| Texts | Telnyx, number +1 301-279-8944 on messaging profile "RSVP" (`4001a103-...`), webhook `https://rsvp.botch.com/api/telnyx/webhook`, signed with the account's Ed25519 key (`TELNYX_PUBLIC_KEY` in `wrangler.jsonc` vars). Sole-proprietor 10DLC; until the campaign is approved every send fails with 40010 |
| Replies | Cloudflare Email Routing on the `rsvp.botch.com` subdomain; `info@` forwards to `jlukens@fastmail.com`, the inbox `jlukens@botch.com` itself forwards to |

The Cloudflare account (`b38725df...`) is shared with pickup-bball and other
sites. Everything else is separate. Brevo applies blocklists and webhooks
across a whole account, so sharing one would let an unsubscribe on one site
silence the other.

Private local files in `~/.config/rsvp-site/` (mode 600, never commit or
print them): `brevo-webhook-secret` (the value set on the Worker),
`admin-link` (the first admin's sign-in link), `brevo-key` and `telnyx-key`. Read them into
commands with `$(cat ...)` and never echo them. A secret the user types goes
in from a real terminal or a web UI: the `!` prefix has no TTY, so a hidden
prompt there reads nothing.

The wrangler OAuth login can't read or write DNS records in the botch.com
zone, so DNS changes go through the user in the dashboard.

The first admin is `jlukens@botch.com`, inserted by SQL into the empty D1.

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
pnpm run test             # vitest run in packages/db, packages/email, packages/api, packages/design
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
pnpm --filter @rsvp-site/api exec vitest run -t "dueEmails"
```

Every package with logic has tests (`packages/db`, `email`, `api`,
`design`, and `apps/web` with its own vitest config) — pure functions (templates, Brevo request shaping, link paths,
address parsing, roles, headcount and potluck arithmetic, the email
schedule's timezone maths, event rules, design validation, text layout,
the scene and the designer's editing logic). Nothing in the test run
touches D1 or the network. CI also renders every template to PDF:

```bash
pnpm --filter web exec tsx scripts/render-design-samples.ts <out dir>
```

Neither catches a mistake that only D1 makes (a raw-SQL batch, a statement
over 100 parameters): exercise anything that writes through the dev server
before pushing.

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

It runs at the real clock (a `time` parameter is ignored), so to make an
email due, move the local event's `date` / `rsvp_deadline` / `published_at`
in D1 instead.

`drizzle-kit generate` asks "created or renamed?" for every new table or
column next to a dropped one, and refuses without a TTY. Run it under
`script -qec "pnpm exec drizzle-kit generate --name x" /dev/null`, feeding
carriage returns (the default is "create"), then hand-edit the SQL: D1 runs a
migration in one transaction, where `PRAGMA foreign_keys=OFF` does nothing,
and the generated drop order ignores foreign keys. 0010's header lists what
had to change.

CI applies migrations before it deploys the new Worker, so for a moment the
old code runs against the new schema. A migration that drops or renames
something the running code reads goes in two steps: ship code that no
longer needs it, then the migration.

Local setup needs `apps/web/.dev.vars` (copy `.dev.vars.example`, set a random
`BETTER_AUTH_SECRET`). Leave `BREVO_API_KEY` unset locally: the mailer then prints
each email to the dev console with the placeholders filled in from the first
recipient, so the sign-in link in the log is clickable. That dry run only
happens when `BETTER_AUTH_URL` is localhost (`allowDryRun` in `worker.ts`);
anywhere else a missing key fails every send instead of logging links.
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

- `packages/db` — Drizzle schema (`src/schema/*`), D1 migrations, the
  person modules that own every read and write of a person's state
  (`people.ts` lookup and create, re-exporting `addresses.ts` parsing,
  `tokens.ts` sign-in/footer tokens, `status.ts` deactivate/role/subscribe),
  `batch.ts` (D1 chunking and batches) and `src/roles.ts` (pure; the web app
  imports it too).
- `packages/auth` — Better Auth factory (`createAuth()`) plus the custom
  `email-link` plugin in `src/link.ts`.
- `packages/api` — oRPC routers (`src/routers/*`; `events.*` is split by
  concern under `routers/events/` and composed back into one namespace),
  event reads and access (`events.ts`, `host-event.ts`), sending
  (`mail.ts`), R2 and uploads (`media.ts`), stored designs
  (`designs-store.ts`, `design-rules.ts`), shared inputs (`inputs.ts`), pure
  rules with tests (`event-rules.ts`), pure modules the web app also
  bundles (`time.ts`, `headcount.ts`, `schedule.ts`, `answer-words.ts` --
  keep those free of drizzle and `cloudflare:workers`), and the cron pass in
  `src/jobs/event-mail.ts`. Routers never import each other.
- `packages/email` — pure template/Brevo code (`src/index.ts`) plus
  `src/worker.ts`, the only file there that touches the Worker env.
- `packages/sms` — the same shape for Telnyx: request shaping and error
  codes (`telnyx.ts`), the text templates, GSM-7 segments, the webhook's
  signature check and parsing, the texter (dry run on localhost), and
  `worker.ts` for the env.
- `packages/design` — invitation designs, pure: the zod schema
  (`schema.ts`), the curated fonts (`fonts.ts`) and their generated
  metrics (`metrics/`), placeholders, text layout (`text.ts`), the scene
  every renderer draws (`scene.ts`), the page theme (`theme.ts`), stickers
  and templates, and the designer's pure editing logic (`editor.ts`: the
  reducer, cloning, restacking, aligning). No drizzle, no
  `cloudflare:workers`, no DOM, no pdf-lib: the Worker validates with it
  and the browser renders with it.
  `metrics/` and `stickers.ts` come from
  `pnpm --filter web exec tsx scripts/gen-design-fonts.ts` (then
  `pnpm run check` to format them); rerun it after changing `FONTS`.
- `packages/env` — `env` re-exported from `cloudflare:workers`; the binding types
  in `env.d.ts` must be kept in sync with `apps/web/wrangler.jsonc`.
- `packages/ui` — shared shadcn/base-ui primitives and the design tokens.

Everything is constructed per request: `createDb()`, `createAuth()`,
`getMailer()`. There are no module-level singletons holding env, because
`cloudflare:workers` env is only valid inside a request.

### Request paths

- Browser → `/api/rpc` via the oRPC client in `apps/web/src/utils/orpc.ts`.
  That file is isomorphic: during SSR it calls `createRouterClient(appRouter)`
  directly (no HTTP hop, with an interceptor that masks unexpected errors the
  way the HTTP handler does), in the browser it uses an `RPCLink`. The link
  sends oRPC's CSRF header and the handler refuses calls without it: other
  botch.com sites are same-site and get our Lax cookies. Anything calling
  `/api/rpc` by hand (curl, a test) must send `x-csrf-token: orpc`.
- The query client refreshes every query on screen after any successful
  mutation and toasts a failed one (`MutationCache` in `orpc.ts`); a
  mutation with its own `onError` or `meta: { quiet: true }` toasts itself.
  4xx answers are not retried.
- oRPC procedures come from `packages/api/src/index.ts`: `publicProcedure`,
  `protectedProcedure` (a session), `personProcedure` (the caller re-read
  from D1 as `context.me`), `hostProcedure` and `adminProcedure`. Roles are
  checked against `context.me`, never `session.user`: the session's copy of
  the user is from sign-in, and a demoted host must stop hosting now.
  Better Auth's cookie cache is off, so a revoked session fails on its next
  request; don't turn it back on.
- Event access is `accessTo` / `hostAccessTo` in `api/src/events.ts`. A
  stranger to an event gets the same NOT_FOUND as a wrong id, guests never
  see drafts, and admins pass everywhere. A host's procedure takes
  `idInput` and `.use(withHostEvent)` (or `withLiveHostEvent`, which also
  refuses a canceled event) from `host-event.ts`, and reads
  `context.event` / `context.access`.
- The session is read once in `apps/web/src/routes/__root.tsx` `beforeLoad`
  (through the `getUser` server function) and flows down as router context.
  `routes/_auth/route.tsx` and `routes/_admin/route.tsx` are the guards. A
  route that draws its own header over a full-bleed picture says so with
  `staticData: { ownHeader: true }`.
- Better Auth's own HTTP endpoints are limited to the ones this site uses:
  `disabledPaths` in `packages/auth/src/index.ts` 404s the admin plugin's
  endpoints, email verification and self-service account writes, because
  people are written only through `people.ts`. The server still reaches
  what it needs through `auth.api`. Using a new Better Auth endpoint from
  the browser means taking it off that list.
- The half-hourly Cron Trigger calls `runEventMail`.
- Deleting is `packages/api/src/endings.ts`: `callOff` (cancel, shared by
  `events.cancel` and `events.remove`), `deleteEventMedia` (R2, which the
  cascades cannot reach) and `erasePerson`. Every foreign key to `event`
  and `user` is CASCADE or SET NULL, so a delete is one statement; keep it
  that way when adding a table. Who may erase an event is `mayDelete`
  (`Access.canDelete`); what a person's delete does to their events is
  `planRemoval`, both pure in `event-rules.ts`.

### Events, guests and roles

- `user.role` is `admin`, `host` or `user` (null = `user`); read it with
  `roleOf` / `canHost` / `isAdmin` from `@rsvp-site/db/roles`. Better Auth's
  admin plugin knows only admin/user and refuses `host`, so roles are written
  by `setRole` in `people.ts`, never `authClient.admin.setRole`.
- Accounts are made by `findOrCreatePeople` (hosts inviting, groups, admins,
  the share link). It inserts directly with both tokens in the insert --
  Better Auth's `createUser` is admin-only -- and is `onConflictDoNothing`
  on email, then re-reads, so two hosts adding one stranger is fine.
  Deactivated people come back as found and callers skip them.
- `event_guest` is the invitation and the answer in one row; `response IS
  NULL` is "no reply" and `invited_at IS NULL` is "not emailed yet".
  `sendInvites` claims rows (`UPDATE ... SET invited_at WHERE invited_at IS
  NULL RETURNING`) before sending and gives them back if nothing left, so
  Send cannot invite anybody twice.
- Address book: `contact` (owner_id, user_id). Every path where a host adds
  people (`guests.add`, `contacts.*`) calls `remember`; a pick by user id
  must pass `inBook` for the caller, and group membership requires the
  person to be in the group owner's book. Guest-added friends and link
  joiners are never remembered.
- Families (`family`, `family_member`; `user_id` is the PK, so one family
  per person): `packages/db/src/families.ts` owns every read of membership
  (`relativesOnEvent`, `pickable`, `listFamilies`, `sharedGroups`). Admins
  keep them; `family.shared` puts one in every host's picker, and a
  contact group goes to the hosts an admin picks (`contact_group_share`;
  `contact_group.shared` is unread and due to be dropped), so `guests.add`
  picks go through `pickable`, not `inBook`. A
  family member answers for relatives on the same event's list, recorded in
  `event_guest.answered_by` (hosts see it; the guest's own answer or a
  host's clears it). A child answered for is stored as adults 0 / kids 1,
  and `tally` floors the sum at 1, not adults, so never print "0 adults".
  Family members are editable only by admins and themselves
  (`canEditDetails`'s `inFamily`).
- Paper events (`event.paper`, fixed once published): guest email of every
  kind is held while `emailsHeld(row)` (paper and no `emails_released_at`);
  check it before any guest-facing send. QR keys are
  `event_guest.paper_token`, held by the host, so a key never signs anybody
  in: `/p/<key>` (the `paper` router: `paper.invite`, `paper.respond`)
  reads and answers that one invitation with no session, and
  `/api/auth/paper` only forwards old cards there. Answers from a card and
  from a session share `answers.ts`. Name-only guests are `user.no_email` with a
  placeholder address; `mailableWhere` and `sendWelcome` skip them and reads
  blank the address. PDFs are built client-side (`lib/paper-pdf-core.ts` is
  the pure layout, renderable from Node to check it; `lib/paper-sizes.ts`
  keeps pdf-lib out of the page bundle).
- Guests inviting guests: only `source` host/group may (`canInviteOthers`
  in `api/src/guest-invites.ts`), only when the event's `guest_invites` is
  on, up to `guest_invite_limit` each, counted in the INSERT. Their friends
  are `source = 'guest'` with `added_by` = the inviter and can never invite;
  share-link joiners (`link`) cannot either. `sendInvites` takes
  `onlyGuestIds` so a guest's invite never sends the host's unsent backlog.
- Potluck claims are guarded in the INSERT itself (`guests.respond`), written
  in plain SQL names: see the Drizzle note under Conventions.
- `/e/$eventId` **reads and does not write**; `?a=` only preselects. Mail
  clients prefetch link targets. The one GET that writes is `/i/$token` for
  somebody already signed in (it joins them), which only a person with a
  session and the link can trigger.
- Views (`event_guest.viewed_at` / `last_viewed_at`, hosts only) are
  stamped by `recordView` (`api/src/views.ts`) through `guests.viewed` and
  `paper.viewed`, which the page calls from the browser once it is on
  screen (`use-record-view.ts`), never from `events.invite` or
  `paper.invite`: those stay reads, so a prefetch counts for nothing.
  `viewedGuestId` decides who counts (the guest, never a host or admin).
  Guest-facing payloads pick `guestsOf` fields by hand; keep them out.
- Two kinds of details: `details` goes wherever the invitation does (the
  page, invitation and day-before emails, printed cards, `{details}` on a
  designed card); `extra_details` is only ever on the invite page, for
  guests who have opened it. Keep it out of `eventFacts`, `paperInvites`,
  `designValues` and the share teaser.
- `headcount.ts` is the only arithmetic for totals; pages and emails must
  not count on their own.
- Answer words are per event: `event.answer_words` (JSON, null = the
  defaults) and `event.allow_maybe`, read only through `answersOf` in
  `api/src/answer-words.ts`, which owns the defaults, presets and
  validation. Stored answers stay yes / maybe / no. Each answer has a
  `pick` (button, chip, heading) and a `count` (after a number); `none` is
  no reply. Every payload that shows answers carries `answers`, the
  components take it as a required prop, and `eventFacts` hands it to the
  emails: never write "Maybe" or "out" literally. With maybe off, `mayPick`
  refuses a new maybe, but one already given stays, still counts, and stays
  on the guest's picker (`offered`).

### Invitation designs

An event can carry a host-built card (`event_design`, shown while
`event.design_on`). `packages/design` owns it: the schema every value
passes, the curated fonts, and `layoutCard`, which turns a design and the
event's facts into a scene -- every line break and every glyph's x,
measured from metrics generated off the same @fontsource files the page
and the PDF use. Three renderers draw that scene and nothing else:

- `components/design/card-svg.tsx` -- the guest page (laid out on the
  server in `invitePayload`), the designer, the editor's preview.
- `lib/design-pdf-core.ts` -- paper, in the browser; pure, so
  `scripts/render-design-samples.ts` renders every template from Node.
- `lib/design-canvas.ts` -- the one JPEG (`event.card_key`) for emails,
  link previews and the dashboard, without `{guest}` or the QR code.

Rules that keep them agreeing, and safe:

- Never let a browser lay out design text: no CSS wrapping, no kerning or
  ligatures (the scene already has them). Change text layout in `text.ts`
  only, and keep `paper-pdf-core.ts`'s old card separate.
- Only parsed values reach CSS, SVG attributes and PDF operators. Colours
  are `#rrggbb`, fonts and stickers come from registries, image refs must
  be this event's `designs/<id>/<uuid>.(jpg|png|webp)`. Never accept SVG
  uploads. `themeCss` output goes into a raw `<style>` on that basis.
- The card picture bakes in the facts. `refreshCard` redraws it after a
  design save and after the editor changes facts; the guest list redraws
  it when `designs.cardInputs` says `card_basis` is stale.
- Old card pictures are kept (sent emails show them); unused uploads are
  pruned on save after an hour, and deleting an event empties its prefix.
- A paper event's design must have a QR code: `needsQr` in
  `routers/designs.ts`, checked on save, on switching on and on send.
- Fonts are faces "<id>-<weight>", with an "i" for italic
  (`parseFace`). Adding a font or weight to `FONTS` means installing its
  @fontsource package and rerunning the generator.
- A template can ship pictures (`Template.assets`, files under
  `apps/web/public/templates/<id>/`). Until picked it is previewed with
  stand-in refs that `designSrc` maps to those files; picking uploads each
  into the event like any image, so a saved design only names the event's
  own. The Night society template's art was cut from the host's own
  invitation picture.

### The email schedule

`packages/api/src/schedule.ts` is pure: `dueEmails(event, now)` says which of
the deadline reminder, day-before reminder and host digest are due, at 10:00
/ 10:00 / 08:00 on the site's clock. `jobs/event-mail.ts` executes: read →
decide → claim → send.

- **A stamp means resolved, not sent.** A reminder whose moment passed (the
  deadline went by, the party started, or the event was published after it
  was due) is stamped and skipped; `email_send` is the record of real sends.
- The claim is `UPDATE event SET col = now WHERE col IS NULL` with
  `result.meta.changes === 1`; the repeating digest claims "older than this
  morning's slot" instead. `events.update` nulls the stamps that belonged to
  a moved date or deadline.
- `siteInstant(date, time)` in `time.ts` converts the wall clock to a UTC
  instant with a two-pass offset fix. The second pass is what survives a
  daylight-saving weekend. Tested; do not "simplify" it to one pass.
- Host alerts for each reply are sent inline from `guests.respond`, awaited
  (nothing plumbs an `ExecutionContext` to oRPC), and never fail the answer.

### The one-table people model

`user` is the accounts, the guests and the mailing list. A person is
`active` or `deactivated`, and separately may be unsubscribed
(`unsubscribed_at` + `unsubscribe_reason`).

- `listRecipients` is the only query behind list sends and excludes
  deactivated and unsubscribed people whatever ids are passed. Use it.
- `banned` is a mirror of `status = 'deactivated'`, written in the same
  statement so Better Auth blocks the password door. It is nullable
  (migration 0000 lacked NOT NULL) — never compare it with `= 0`.
- Self-service paths (`resubscribe`, the unsubscribe form, the Brevo
  webhook) never touch a deactivated row; the guards are in the `where`
  clauses. Turning email back on also calls `getMailer().unblock`.
- Details (`first_name`, `last_name`, `phone`, the address columns) are
  the person's own, written only through `details.ts` and
  `findOrCreatePeople`; `name` is always rewritten beside the pair
  (`nameFor`), since Better Auth and every email read it. `claimed_at` is
  the first sign-in (the session-create hook): before it a host with them
  in their book may edit a plain guest's details, after it only they and
  an admin. `canEditDetails` decides and the UPDATE repeats the condition.
  Pastes only fill blanks (`fillBlanks`). Phones are stored by
  `normalizePhone` and shown by `formatPhone`.
- `user.image` (Better Auth's column) is the profile picture's R2 key,
  not a URL; null shows initials. Only `api/src/avatar.ts` writes it, for
  the person (`account.setPicture`) or an admin (`people.setPicture`);
  hosts never, even before a sign-in. The browser crops and renders the
  512px JPEG (`lib/avatar-crop.ts` is the pure maths the screen and the
  canvas share), the server takes nothing else, and `erasePerson`
  deletes it. Show it through `Avatar`'s `image`.
- `link_token` and `unsubscribe_token` are stamped at insert by
  `findOrCreatePeople`, and by the Better Auth `user.create.after` hook
  (`stampTokens`) for rows it makes, so nobody exists with no way in.

- A guest's friend invitations are capped on `event_guest.invites_sent`
  (the inviter's row), bumped in the same batch as the insert; taking one
  back doesn't hand it back. A sign-in token can be replaced
  (`people.newLink` for admins, `account.signOutEverywhere` for anyone),
  which also ends every session.
- Workers' per-request (invocation) logs are off in `wrangler.jsonc`:
  sign-in and unsubscribe URLs carry their tokens. Log addresses through
  `redactEmail`, never a token or a `k=` URL.

### Email and sign-in links

`link_token` is a bearer credential: every link in every list email is
`/api/auth/link?k=<token>&to=<path>`, and clicking it opens a session. Never put
one on a URL meant to be shown around (cover photo URLs deliberately carry
nothing), and never hand it to Better Auth as an additional user field — those get
base64'd into a browser-readable cookie. `safeReturnPath` sanitizes `to` by
resolving it as a browser would and keeping it only if it stays on the site;
don't go back to string checks, which the URL parser's quirks (a tab, a
backslash) walk straight past.

List sends go through `packages/api/src/mail.ts` → `Mailer.sendList`, which
batches up to 99 personalised copies per Brevo request using `messageVersions`;
templates therefore contain the `PARAM` placeholders from
`packages/email/src/render.ts` (`{{ params.key }}`, `{{ params.unsubscribeUrl }}`)
rather than concrete URLs, and their output must never be run through
`escapeHtml`. Brevo runs its template language over every part of a send, so
the mailer lets only those placeholders open a tag (`guardTemplateSyntax`);
anything a person typed containing "{{" or "{%" is defused there, centrally.
Every list send writes one `email_send` row. Email bodies stay
light (dark backgrounds get mangled by mail clients' dark modes); the brand is
the plum band, the cover and the lime buttons. Colours come from a `Palette`
passed to the builders (After Dark, or `paletteOf` an event's design); never
recolour finished HTML.

Brevo POSTs are retried only on 429 and 503, which mean nothing was sent. A
timeout or another 5xx may come after Brevo accepted a 99-person batch, and a
retry would send it twice.

### Texts

- `deliver` in `api/src/mail.ts` sends every event message (invite, nudge,
  reminders, update, cancel, host alert, digest): email and/or text per
  person by `channelsFor` (`api/src/channels.ts`, pure, tested). Don't call
  `sendToList` for an event message; it is for the admin's broadcast.
  `deliver` returns null when nobody is reachable, like `sendToList` did,
  and `failedIds` are the people no channel reached (the claims to give back).
- `listTextable` / `textableWhere` sit beside `listRecipients` /
  `mailableWhere`: consent (`texts_ok_at`), texts on, a US number, not in
  `sms_block`. D1 refuses a long GLOB as "too complex", so the SQL checks
  the number's shape loosely and `textablePhone` exactly.
- Consent is the host's tick ("they expect a text from me") or the person's
  own switch, written only by `sms-status.ts`. A host's word only fills a
  blank on an unclaimed record and is cleared when the number changes
  (`updateDetails`).
- `sms_block` is per number, because STOP is: Telnyx blocks the number
  across the profile. Only START (`unblockNumber`) lifts a `stop`.
- `text_link` codes are bearer credentials like `link_token`, which they
  copy; `redeemTextLink` requires the copy to match, so `rotateLinkToken`
  retires them. `/t/<code>` is served in `server.ts` before TanStack and
  redirects to `/api/auth/link`. Never log one.
- `emailsHeld` holds texts too: every `deliver` call sits behind it.
- Log phones as their last four digits, never whole.

### D1 limits

- A statement takes at most 100 bound parameters, and drizzle binds every
  column of every inserted row, literal defaults included. Bulk inserts go
  through `insertChunks(table, rows)` and long id lists through
  `mapChunks` (`@rsvp-site/db/batch`), or are replaced by a join.
- `db.batch` (atomic on D1) takes query builders, but drizzle 0.45 cannot
  batch raw `sql` with parameters: it fails at run time, not in the
  typecheck. Use `rawBatch(db.$client, [built(...), ...])` from the same
  module for a batch that mixes them (the potluck claim in
  `guests.respond`).

## Conventions

- Biome: tabs, double quotes, `preset: recommended`, organize-imports on. Run
  `pnpm run check` while working, and `pnpm exec biome ci .` before pushing:
  that is what CI runs, and it is stricter -- it lints files `check` lets
  through (an SVG in `public/` needs a `<title>`, for one).
- TypeScript is strict with `noUncheckedIndexedAccess`, `noUnusedLocals` and
  `verbatimModuleSyntax` (use `import type`), the web app included: every
  tsconfig extends `packages/config/tsconfig.base.json`.
- Imports: `@/*` inside `apps/web/src`, `@rsvp-site/<pkg>` across packages.
  Subpath imports are the norm (`@rsvp-site/db/people`,
  `@rsvp-site/ui/components/button`).
- Design system lives in `packages/ui/src/styles/globals.css`: After Dark,
  dark everywhere except a designed event's own pages, which override the
  tokens on `:root` (`DesignTheme`). Text on a lime or pink fill is
  `text-on-lime` / `text-on-pink` and lime or pink used as text is
  `text-lime-ink` / `text-pink-ink`, never `text-night` / `text-lime`, so
  a pale accent or a light page still reads. No literal colours in
  components. Unbounded headings (`font-heading`) over Manrope; tokens
  `bg-night`, `bg-panel`, `bg-panel-2`, `border-line`, `text-ink`,
  `text-soft`, `text-haze`, `bg-lime`, `text-pink`, plus `.kicker` and
  `.numeral`. Lime is yes and the main action, pink is maybe and "send";
  nothing else gets a color. Pills (`rounded-full`) for buttons and chips,
  ~26px radius for panels. Text on an ink fill is `text-on-ink`. Shared
  pieces: `components/page.tsx` (`Page`, `PageHead`, `Panel`),
  `controls.tsx` (answer picker, stepper, switch, field), `response-bar.tsx`,
  `event-card.tsx`, `event-hero.tsx`, `event-crumbs.tsx` (the way back
  from an event's sub-pages), `confirm-action.tsx` (every inline
  "are you sure?"; it moves focus), `guest-picker.tsx`, `notice.tsx`,
  `native-select.tsx`. The editor is `components/event-editor/` (a draft
  hook, a save hook, a file per section); the designer's panels and hooks
  are in `components/design/`. Button variants: default (lime), `send`
  (pink), `light`, `outline`, `pink`, `ghost`, `destructive`.
- `cn()` is shadcn's `cn` package, which merges Tailwind classes the way
  tailwind-merge does: a `leading-*` placed before a `text-*` size in the
  same `cn()` is dropped. Put leading after the size.
- Copy shared across pages lives in `apps/web/src/content/site.ts` (the
  landing page, `SITE_NAME` and `pageTitle()` for every `head()` title, the
  dry-run notice); a page's own words stay in the page. Time and formatting in
  `packages/api/src/time.ts` (`SITE_TIMEZONE`, `todayOnSite`, `formatDate`).
- Event `date` is a `YYYY-MM-DD` string and times `HH:MM`, both in
  `America/New_York`. Compare with `todayOnSite()`, not with `Date`.
- The countdown is the app's only ticking UI. Seed its clock from the payload's
  `now` (and "today" from the payload's `today`), never `Date.now()` in render
  or a `useState` initializer, or the SSR markup and the hydration markup
  disagree. Every `toLocale*` call on a date
  passes `timeZone: "America/New_York"` for the same reason.
- **Drizzle only writes table-qualified column names when a query has a join.**
  A correlated subquery inside a `sql` template on a single-table `from` comes
  out as `where "event_id" = "id"` — both resolve against the subquery's own
  table, and it silently returns zeros. Either join and aggregate, or write
  the raw SQL with plain aliased names (what the potluck claim in
  `guests.respond` does).
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
