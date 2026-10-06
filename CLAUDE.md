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

As of 2026-10-06 the site is close to feature complete: events and guest
lists, email and texts, paper invitations, a card designer, households,
shared groups, profile pictures, per-event answer words and dietary needs on
the person. Work now is mostly refinement, so prefer consolidating to adding:
most rules already have one home (named below), and a second copy of one is
the usual bug.

The look is "After Dark" from a Claude Design export (`~/rsvp.zip`): plum
night, lime and hot pink, Unbounded over Manrope, pills. The README has the
user-facing description of every feature, the page and router tables, and
the setup runbooks; this file is the rules for changing the code.

### Infrastructure

| What | Value |
|---|---|
| Worker | `rsvp-site`, custom domain `rsvp.botch.com` (botch.com zone); `rsvp-site.jlukens.workers.dev` 301s to it |
| D1 | `rsvp-site-db`, id `d0cd9e71-cbed-41f0-bb6a-667c63bfdeb3`, migrations 0000-0027 applied (CI applies new ones on push) |
| R2 | `rsvp-site-media` (binding `MEDIA`): cover photos under `covers/`, design images and card pictures under `designs/<event id>/`, profile pictures under `avatars/` |
| Cron | `0,30 * * * *`: `runEventMail` and `pruneTelnyxEvents` (`apps/web/src/server.ts`) |
| Rate limits | `JOIN_LIMITER`, namespace 4207, 5 a minute per IP on the share-link email form; `AUTH_LIMITER`, namespace 4208, 10 a minute: per path and IP on password sign-in, resets, password change and the `/link` and `/paper` doors; per IP on `/t/` codes, "email/text me my link" (one shared bucket) and a printed card's contact form; per person on guests inviting friends and giving us their address or number. All of it through `requireUnderLimit` / `callerIp` (`api/src/limits.ts`) or `throttleKey` (`server/throttle.ts`) |
| Secrets | `BETTER_AUTH_SECRET`, `BREVO_WEBHOOK_SECRET`, `BREVO_API_KEY`, `TELNYX_API_KEY` |
| Vars | `BETTER_AUTH_URL`, `TELNYX_FROM`, `TELNYX_PUBLIC_KEY` (`wrangler.jsonc`) |
| GitHub | `apnar/rsvp-site`, public; CI secret `CLOUDFLARE_API_TOKEN` is set, so a push to `main` migrates and deploys |
| Sender | `"Botch RSVP" <info@rsvp.botch.com>`, in this site's own Brevo account ("Botch Systems"), which is not pickup-bball's. The domain is authenticated (DKIM `brevo1`/`brevo2._domainkey.rsvp`, brevo-code TXT on `rsvp`), and DMARC passes under botch.com's own `p=none` |
| Brevo webhook | id 2217340, posting to `https://rsvp.botch.com/api/brevo/webhook` |
| Texts | Telnyx, number +1 301-279-8944 on messaging profile "RSVP" (`4001a103-...`), webhook `https://rsvp.botch.com/api/telnyx/webhook`, signed with the account's Ed25519 key (`TELNYX_PUBLIC_KEY`). Sole-proprietor 10DLC; until the campaign is approved every send fails with 40010 |
| Replies | Cloudflare Email Routing on the `rsvp.botch.com` subdomain; `info@` forwards to `jlukens@fastmail.com`, the inbox `jlukens@botch.com` itself forwards to |

The Cloudflare account (`b38725df...`) is shared with pickup-bball and other
sites. Everything else is separate. Brevo applies blocklists and webhooks
across a whole account, so sharing one would let an unsubscribe on one site
silence the other.

Private local files in `~/.config/rsvp-site/` (mode 600, never commit or
print them): `brevo-webhook-secret` (the value set on the Worker),
`admin-link` (the first admin's sign-in link), `brevo-key` and `telnyx-key`.
Read them into commands with `$(cat ...)` and never echo them. A secret the
user types goes in from a real terminal or a web UI: the `!` prefix has no
TTY, so a hidden prompt there reads nothing.

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

pnpm + Turborepo, Node 24. Run these from the repo root.

```bash
pnpm install
pnpm run dev              # dev server (pages + API) at http://localhost:3001
pnpm run build            # vite build -> Worker bundle + assets
pnpm run check            # biome check --write .  (format + lint + organize imports)
pnpm exec biome ci .      # what CI runs; stricter than check (lints SVGs too)
pnpm run check-types      # tsc --noEmit across the workspace
pnpm run test             # vitest run in every package with tests, and apps/web
pnpm run deploy           # build + wrangler deploy (needs a TTY; see below)
```

`pnpm run deploy` and the `db:*` scripts go through turbo, which marks those
tasks interactive and refuses them without a terminal UI (so they fail from
Claude's shell). Run the underlying commands from `apps/web`:
`pnpm run deploy` there (`vite build && wrangler deploy`), and
`pnpm exec wrangler d1 migrations apply DB --local` or `--remote`.

The web app's typecheck needs `apps/web/src/routeTree.gen.ts`, which the
TanStack Start Vite plugin generates and git ignores, so turbo runs the build
before `web#check-types` (`turbo.json`), and CI builds before it typechecks.

Single test file / single test:

```bash
pnpm --filter @rsvp-site/email exec vitest run src/links.test.ts
pnpm --filter @rsvp-site/api exec vitest run -t "dueEmails"
```

Every package with logic has tests (`packages/db`, `email`, `sms`, `api`,
`design`, `env`, and `apps/web` with its own vitest config), all of pure
functions: templates, Brevo and Telnyx request shaping, link paths, address
parsing, roles, who can be reached, the SQL guards in `details.ts` (read as
SQL through drizzle's `toSQL`, without D1), headcount and potluck arithmetic,
the email schedule's timezone maths, event rules, the webhooks' decisions,
design validation, text layout, the scene and the designer's editing logic.
Nothing in the test run touches D1 or the network. CI also renders every
template to PDF:

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
had to change. Check every new foreign key has an `onDelete`: drizzle-kit
once wrote `created_by` without one (0026), which would have blocked erasing
the person who created others.

CI applies migrations before it deploys the new Worker, so for a moment the
old code runs against the new schema. A migration that drops or renames
something the running code reads goes in two steps: ship code that no
longer needs it, then the migration (0026/0027 did this for
`contact_group.shared`).

Local setup needs `apps/web/.dev.vars` (copy `.dev.vars.example`, set a random
`BETTER_AUTH_SECRET`). Leave `BREVO_API_KEY` and `TELNYX_API_KEY` unset
locally: the mailer then prints each email to the dev console with the
placeholders filled in from the first recipient, so the sign-in link in the
log is clickable, and the texter prints each text. That dry run only happens
when `BETTER_AUTH_URL` is `localhost` or `127.0.0.1` (`allowDryRun` in
`@rsvp-site/env/server`); anywhere else a missing key fails every send,
because a dry-run log holds live sign-in links. Here `.dev.vars` was created
without keys, and the local D1 holds no real people. If a key is ever added,
strip it and restart before exercising any send, and check first that
`mail.status` reports `dryRun: true`. Otherwise a local "test" send is a real
one to everybody on the list.

## Architecture

One Cloudflare Worker serves everything. `apps/web` is a TanStack Start app
built with the Cloudflare Vite plugin; `apps/web/src/server.ts` is the Worker
module: a 301 of every non-canonical host to `BETTER_AUTH_URL`, the `/t/`
text links, then the TanStack server entry, plus the `scheduled` handler. A
Hono app (`apps/web/src/server/app.ts`) is mounted at `/api/*` by the
catch-all route `apps/web/src/routes/api/$.ts`, so pages and API share an
origin: no CORS, ordinary same-site cookies. Hono serves `/api/auth/*`
(Better Auth, with the throttle), `/api/rpc/*` (oRPC), the R2 pictures
(`/api/covers`, `/api/designs`, `/api/avatars`, names checked by regex,
immutable caching, `nosniff`), `/api/unsubscribe`, the two webhooks (bodies
capped at 64 KB by `readCapped` in `server/body.ts` before any signature
check) and `/api/health`.

### Packages

All consumed as raw TypeScript source via `exports` subpaths -- no build step
for libraries; only `apps/web` builds. Import each module by its own subpath
(`@rsvp-site/db/people`, `@rsvp-site/api/headcount`).

- `packages/db` -- Drizzle schema (`src/schema/*`), D1 migrations,
  `createDb()` (every helper takes `db` as an argument), and the modules that
  own every read and write of a person's state:
  - `people.ts` lookup, `findOrCreatePeople`, `listRecipients`,
    `listTextable`
  - `reach.ts` who can be emailed or texted -- the SQL guards
    (`mailableWhere`, `textableWhere`, `stillIn`) and their JS twins
    (`isMailable`, `isTextable`) side by side
  - `details.ts` a person's details and the guards on who may change them
    (`canEditDetails`, `canEditReach`, `editable`, `fillable`, `fillBlanks`,
    `writeEmail`, `changeEmail`, `claimEmail`, `setDiets`, `markClaimed`,
    `contactGaps`)
  - `addresses.ts` parsing pasted lines (`parseGuests`), `phone.ts`
    (`normalizePhone`, `formatPhone`), `names.ts` (`nameFor`, `splitName`,
    `displayName`, `NAME_MAX`)
  - `tokens.ts` sign-in and footer tokens (`rotateLinkToken`, which also
    deletes the person's `text_link` rows; each token is stamped by its own
    `IS NULL` UPDATE, so stamping one never replaces the other already in an
    inbox)
  - `status.ts` deactivate, role, unsubscribe/resubscribe;
    `sms-status.ts` text consent, `sms_block`, contact preferences
  - `address-book.ts` (`remember`, `inBook`, `bookByPhone` -- only within the
    host's own book and only when one person has the number -- and
    `repointEntry`), `families.ts`, `paper.ts` (card keys), `arrival.ts`
    (the `arrived_via` cookie), `text-links.ts`, `diets.ts`
  - `batch.ts` (D1 chunking and batches), `errors.ts` (`logError`,
    `isUniqueViolation`) and `roles.ts` (pure; the web app imports it too).
- `packages/auth` -- Better Auth factory (`createAuth()`) plus the custom
  `email-link` plugin in `src/link.ts`. See "Sign-in" below.
- `packages/api` -- oRPC routers (`src/routers/*`; `events.*` is split by
  concern under `routers/events/` -- dashboard, editor, cover, sending,
  paper, share -- and spread back into one flat namespace) and the modules
  behind them:
  - access: `events.ts` (`accessTo`, `hostAccessTo`), `host-event.ts`
  - sending: `mail.ts` (email, `deliver`, `notice`, `sendInvites`,
    `alertHosts`), `texting.ts`, `channels.ts`, `jobs/event-mail.ts` (the
    cron pass)
  - answering: `answers.ts`, `guest-invites.ts`, `views.ts`, `diet.ts`,
    `contact-ask.ts`, `email-claim.ts`
  - people: `typed-people.ts` (pasted lines into people), `details.ts`,
    `avatar.ts`, `endings.ts` (deletes)
  - media and designs: `media.ts`, `image-type.ts`, `designs-store.ts`,
    `design-rules.ts` (`needsQr`), `invite-payload.ts`
  - plumbing: `limits.ts`, `inputs.ts`, `context.ts`
  - pure, tested rules: `event-rules.ts`, and the modules the web app also
    bundles -- `time.ts`, `headcount.ts`, `schedule.ts`, `answer-words.ts`
    (keep those four free of drizzle and `cloudflare:workers`).

  Routers never import each other.
- `packages/email` -- pure template and Brevo code: `brevo.ts` (the client,
  retries), `mailer.ts` (`sendList`, batching, dry run), `render.ts` (blocks,
  layout, `PARAM`, `EmailLook`, `guardTemplateSyntax`, `redactEmail`),
  `templates/*`, `links.ts`, `webhook.ts` (`dropsFrom`), `sender.ts`, the
  party and total words every screen and email shares (`party.ts`; the web
  app imports it), plus `src/worker.ts`, the only file there that touches the
  Worker env.
- `packages/sms` -- the same shape for Telnyx: request shaping and error
  codes (`telnyx.ts`), the text templates, GSM-7 folding and segments, the
  webhook's signature check and keyword parsing, the texter (dry run on
  localhost), `redactPhone`, and `worker.ts` for the env.
- `packages/design` -- invitation designs, pure. See "Invitation designs".
- `packages/env` -- `env` re-exported from `cloudflare:workers` with
  `siteUrl()` and `allowDryRun()` (`./server`; the pure origin logic in
  `./origin`). The binding types in `env.d.ts` must be kept in sync with
  `apps/web/wrangler.jsonc`.
- `packages/ui` -- shared base-ui/shadcn primitives (button, dropdown-menu,
  input, sonner, textarea) and the design tokens (`styles/globals.css`).
- `packages/config` -- `tsconfig.base.json`, which every tsconfig extends.

Everything is constructed per request: `createDb()`, `createAuth()`,
`getMailer()`. There are no module-level singletons holding env, because
`cloudflare:workers` env is only valid inside a request.

### Pages and guards

| Route file | Path | Notes |
|---|---|---|
| `index.tsx` | `/` | landing; a signed-in person goes to `/events` |
| `login`, `forgot-password`, `reset-password` | | `/login` takes an address or a number |
| `terms`, `privacy` | | words in `components/legal.tsx` |
| `i.$token.tsx` | `/i/<share token>` | public teaser; joining is a button (`events.join` by email, `events.claimJoin` when signed in) |
| `p.$token.tsx` | `/p/<card key>` | a printed card's page; no session (`paper.*`) |
| `confirm-email.tsx` | `/confirm-email?k=` | the button writes (`contact.claim` / `contact.confirm`) |
| `_auth/events.tsx` | `/events` | host dashboard (`?tab=drafts\|past`, admin `?all=true`) or a guest's invitations |
| `_auth/e.$eventId.index.tsx` | `/e/<id>` | invite page; hosts see it under `invite/host-bar.tsx` |
| `_auth/e.new.tsx`, `e.$eventId.edit.tsx` | | the editor (`components/event-editor/`) |
| `_auth/e.$eventId.guests.tsx` | | the guest list (`components/guest-list/`) |
| `_auth/e.$eventId.design.tsx` | | the designer, `ssr: false`, `gcTime: 0` |
| `_auth/contacts.tsx`, `account.tsx` | | book and groups (hosts); a person's own account |
| `_admin/admin.*.tsx` | `/admin/users\|families\|groups\|email` | `/admin` redirects to users |

The session is read once in `__root.tsx` `beforeLoad` (through the
`getUser` server function, which hands the page only id, name, email, role
and image) and flows down as router context. `_auth/route.tsx` and
`_admin/route.tsx` are the guards; `/e/new` and `/contacts` also send
non-hosts to `/events`. Page guards only decide what renders: the event
pages are behind `_auth` alone, and the procedures refuse a non-host with
NOT_FOUND. A route that draws its own header over a full-bleed picture says
so with `staticData: { ownHeader: true }` (`/i`, `/p`, `/e/<id>`, the
designer).

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
- Procedures come from `packages/api/src/index.ts`: `publicProcedure`,
  `personProcedure` (a session, and the caller re-read from D1 as
  `context.me`; a deactivated person is UNAUTHORIZED), `hostProcedure` and
  `adminProcedure` on top of it. (`protectedProcedure` is internal.) Roles
  are checked against `context.me`, never `session.user`: the session's copy
  of the user is from sign-in, and a demoted host must stop hosting now.
  Better Auth's cookie cache is off, so a revoked session fails on its next
  request; don't turn it back on. `paper.*` is all `publicProcedure`: the
  card key is the only credential.
- Errors are logged through `logError` (`@rsvp-site/db/errors`), never
  `console.error(error)`: drizzle writes a failed query's bound parameters
  into the message and the stack, and here those are addresses, numbers
  and sign-in tokens. The RPC handler, the Hono app's `onError` and the
  cron already do.
- Event access is `accessTo` / `hostAccessTo` in `api/src/events.ts`. A
  stranger to an event gets the same NOT_FOUND as a wrong id, guests never
  see drafts, and admins pass everywhere. A host's procedure takes
  `idInput` and then `.use(withHostEvent)` (or `withLiveHostEvent`, which
  also refuses a canceled event; `liveHostEvent(message)` words that
  refusal) from `host-event.ts` -- after
  `.input()`, since they read `input.eventId`, and only on `hostProcedure`
  -- and reads `context.event` / `context.access`.
- Better Auth's own HTTP endpoints are limited to the ones this site uses:
  `disabledPaths` in `packages/auth/src/index.ts` 404s the admin plugin's
  endpoints, email verification and self-service account writes, because
  people are written only through the db modules. The server still reaches
  what it needs through `auth.api`. Using a new Better Auth endpoint from
  the browser means taking it off that list. `advanced.ipAddress` reads only
  `cf-connecting-ip`: `x-forwarded-for` is the caller's to set.
- Deleting is `packages/api/src/endings.ts`: `callOff` (cancel, shared by
  `events.cancel` and `events.remove`; it runs only if its claim on
  `status = 'published'` wins), `deleteEventMedia` (R2, which the cascades
  cannot reach) and `erasePerson`. Every foreign key to `event` and `user`
  is CASCADE or SET NULL, so a delete is one statement; keep it that way
  when adding a table. Who may erase an event is `mayDelete`
  (`Access.canDelete`); what a person's delete does to their events is
  `planRemoval`, both pure in `event-rules.ts`.

### Sign-in

- `link_token` is a bearer credential: every link in every list email is
  `/api/auth/link?k=<token>&to=<path>`, and clicking it opens a session.
  Never put one on a URL meant to be shown around (picture URLs
  deliberately carry nothing), and never hand it to Better Auth as an
  additional user field -- those get base64'd into a browser-readable
  cookie.
- The `email-link` plugin (`packages/auth/src/link.ts`) checks
  `status === "deactivated"` itself (it mints its own session, so the admin
  plugin's ban check never runs), marks the address verified only when the
  link was emailed (not `via=text`, not a placeholder address), keeps any
  password, creates the session with no second argument (passing one means
  "don't remember me", a one-day session), and sets the two-hour
  `arrived_via` cookie (`arrival.ts`; a forged value only mislabels the
  forger's own row). Its own `rateLimit` is per isolate and barely counts;
  `AUTH_LIMITER` in `app.ts` is the real limit.
- `safeReturnPath` sanitizes `to` by resolving it as a browser would and
  keeping it only if it stays on the site; don't go back to string checks,
  which the URL parser's quirks (a tab, a backslash) walk straight past.
- Hooks: `user.create.after` stamps tokens (`stampTokens`) on rows Better
  Auth makes, so nobody exists with no way in; `session.create.after`
  stamps `claimed_at` (`markClaimed`) on every way in. Both swallow their
  errors so a hook never fails a sign-in (`ensureLinkToken` is the
  fallback). A card key opens no session, so it never claims.
- `/api/auth/paper` only forwards old printed cards to `/p/<key>`.
- "Email me my link" and "text me my link" answer the same for any address
  or number and do the work under `waitUntil`, so a known one is not
  measurably slower.
- A sign-in token can be replaced (`people.newLink` for admins,
  `account.signOutEverywhere` for anyone), which also ends every session.

### Events, guests and roles

- `user.role` is `admin`, `host` or `user` (null = `user`); read it with
  `roleOf` / `canHost` / `isAdmin` from `@rsvp-site/db/roles`. Better Auth's
  admin plugin knows only admin/user and refuses `host`, so roles are written
  by `setRole` in `status.ts`, never `authClient.admin.setRole`.
- Accounts are made by `findOrCreatePeople` (hosts inviting, groups, admins,
  the share link). It inserts directly with both tokens in the insert --
  Better Auth's `createUser` is admin-only -- and is `onConflictDoNothing`
  on email, then re-reads, so two hosts adding one stranger is fine.
  Deactivated people come back as found and callers skip them. Its `by`
  is who typed them in, recorded as `user.created_by`. Pasted lines go
  through `typedPeople` (`api/src/typed-people.ts`), whose options carry
  each caller's differences (guest list, book, family).
- `event_guest` is the invitation and the answer in one row; `response IS
  NULL` is "no reply" and `invited_at IS NULL` is "not emailed yet".
  `sendInvites` claims rows (`UPDATE ... SET invited_at WHERE invited_at IS
  NULL RETURNING`) before sending and gives back what nothing reached
  (`releaseGuestClaim`, keyed on the claim's own stamp, so it never hands
  back a concurrent send's rows). Send cannot invite anybody twice; nudges
  claim `nudged_at` the same way, twelve hours apart.
- Address book: `contact` (owner_id, user_id). Every path where a host adds
  people (`guests.add`, `contacts.*`) calls `remember`; a pick by user id
  must pass `inBook` for the caller, and group membership requires the
  person to be in the group owner's book. Guest-added friends and link
  joiners are never remembered.
- Families (`family`, `family_member`; `user_id` is the PK, so one family
  per person): `packages/db/src/families.ts` owns every read of membership
  (`relativesOnEvent`, `relativesOf`, `inAnyFamily`, `pickable`,
  `listFamilies`, `sharedGroups`). Admins keep them; `family.shared` puts
  one in every host's picker, and a contact group goes to the hosts an
  admin picks (`contact_group_share`), so `guests.add` picks go through
  `pickable`, not `inBook`. A family member answers for relatives on the
  same event's list, recorded in `event_guest.answered_by` (hosts see it;
  the guest's own answer or a host's clears it). A child answered for is
  stored as adults 0 / kids 1, and `tally` floors the sum at 1, not adults,
  so never print "0 adults". Family members are editable only by admins and
  themselves (`canEditDetails`'s `inFamily`).
- Paper events (`event.paper`, fixed once published): guest email and texts
  of every kind are held while `emailsHeld(row)` (`schedule.ts`; paper and
  no `emails_released_at`). Check it before any guest-facing `deliver`;
  host alerts and digests are not held. A guest can't invite friends while
  it holds (`inviteRefusal`). Switching a draft from paper back to email
  nulls every `paper_token`. QR keys are `event_guest.paper_token`, held by
  the host, so a key never signs anybody in: `/p/<key>` (the `paper`
  router) reads and answers that one invitation with no session;
  `paperAccess` refuses drafts, deactivated people and replaced keys with
  the generic NOT_FOUND; `findPaperInvite` lowercases the key (QR codes
  carry it upper case); `cardHost` decides whose word a card carries.
  Answers from a card and from a session share `answers.ts`. Name-only
  guests are `user.no_email` with a placeholder address; `mailableWhere`
  and `sendWelcome` skip them and reads blank the address. Card PDFs are
  built client-side (`lib/paper-pdf-core.ts` is the pure layout,
  renderable from Node; `lib/paper-sizes.ts` keeps pdf-lib out of the page
  bundle).
- After answering, a guest with no address or no number is asked for it
  (`me.missing`, from `contactGaps` in `db/details.ts`;
  `api/src/contact-ask.ts`). A number is written at once; an address only
  gets a link, signed and stateless (`email-claim.ts`: HMAC with a purpose
  prefix so no other signature from that secret passes for one, three days),
  and is added by the button on `/confirm-email` (`claimEmail`, which keeps
  the tokens: texted links copy them). A card (`paper.addContact`) fills
  only blanks the host who put its guest on the list could (`FilledBy`'s
  `card` is that host, carried in the claim too): a record nobody has
  signed in to, that host typed in. Its yes to texts is recorded as that
  host's.
- Guests inviting guests: only `source` host/group may (`canInviteOthers`
  in `api/src/guest-invites.ts`), only when the event's `guest_invites` is
  on, up to `guest_invite_limit` each. The cap is on
  `event_guest.invites_sent` (the inviter's row), checked in the INSERT and
  bumped in the same `rawBatch`; taking one back doesn't hand it back.
  Their friends are `source = 'guest'` with `added_by` = the inviter and
  can never invite; share-link joiners (`link`) cannot either.
  `sendInvites` takes `onlyGuestIds` so a guest's invite never sends the
  host's unsent backlog. The answer never says whether the address already
  had an account.
- Potluck claims are guarded in the INSERT itself (`answer()` in
  `api/src/answers.ts`, which `guests.respond` and `paper.respond` share),
  written in plain SQL names: see the Drizzle note under Conventions.
- `/e/$eventId` **reads and does not write**; `?a=` only preselects. Mail
  clients prefetch link targets. No GET writes anywhere: the share link
  joins a signed-in person by button, `/confirm-email` and the unsubscribe
  page by button.
- Views (`event_guest.viewed_at` / `last_viewed_at`, hosts only) are
  stamped by `recordView` (`api/src/views.ts`) through `guests.viewed` and
  `paper.viewed`, which the page calls from the browser once it is on
  screen (`use-record-view.ts`), never from `events.invite` or
  `paper.invite`: those stay reads, so a prefetch counts for nothing.
  `viewedGuestId` decides who counts (the guest, never a host or admin);
  `VIEW_REFRESH_MS` (10 minutes) keeps open tabs from each costing a write,
  and the first view and its `via` win (`coalesce`). Guest-facing payloads
  pick `guestsOf` fields by hand; keep views out of them.
- Two kinds of details: `details` goes wherever the invitation does (the
  page, invitation and day-before emails, printed cards, `{details}` on a
  designed card); `extra_details` is only ever on the invite page, for
  guests who have opened it. Keep it out of `eventFacts`, `paperInvites`,
  `designValues` and the share teaser.
- `headcount.ts` is the only arithmetic for totals (and for whether an
  answer brings somebody); pages and emails must not count on their own.
  Saying a party or a total in words ("2 adults, 1 kid") is `partyLabel` /
  `totalsLabel` in `@rsvp-site/email/party`.
- Diets are the person's, not the answer's: `user.diets` (JSON ids from
  `DIETS` in `@rsvp-site/db/diets`, pure; read only through `dietsOf`,
  which drops unknown ids so a preset can be retired), `diet_note`, and
  `diet_at`, stamped on every save *or confirmation* (null = never asked,
  so the post-answer panel opens the boxes instead of "still right?").
  `event_guest.party_diet` is only for a party's uninvited people, kept
  while `extraPeople > 0`. Writers: `updateDetails` (the details forms, under
  `canEditDetails`) and `setDiets` with a `DietBy` guard in the UPDATE --
  family members may set each other's diets (the one detail they may), and
  a card counts as its guest for the people it may answer for
  (`paper.saveDiet`). `guestsOf` blanks diets unless passed
  `{ diets: event.askDietary }`: a host who didn't ask isn't shown them.
  `dietCounts` in `headcount.ts` is the only count (yes rows only).
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
- `events.update` sends a change notice only when the event is published,
  "tell guests" is on, the change `movesGuestFacts`, and email isn't held;
  it nulls the schedule stamps that belonged to a moved date or deadline.
  Paper vs email can't change after sending, nor can the date be cleared.
- The CSV (`events.exportCsv`) goes through `csvCell`, which prefixes `'`
  on a leading `= + - @`, tab or CR: a guest's note is not a formula.

### Invitation designs

An event can carry a host-built card (`event_design`, shown while
`event.design_on`). `packages/design` owns it, pure (no drizzle, no
`cloudflare:workers`, no DOM, no pdf-lib: the Worker validates with it and
the browser renders with it):

- `schema.ts` -- the zod schema every value passes. `FORMATS` (`5x7`,
  `5x7l`, `square`, `8x10`, `half`, `letter`; the card is 1000 units wide),
  elements (text, image, rect, ellipse, line, sticker, qr; ids
  `^[a-z0-9]{1,12}$`, unique), backgrounds (solid, linear, radial, image
  with tint, pattern), `LIMITS` (80 elements, 12 images, 64 KB of JSON) and
  `BOUNDS`, the one source of every numeric limit for both the schema and
  the designer's clamps. A QR element must be square and paper-only;
  `refsBelongTo` refuses refs outside the event and any `card-` picture.
- `fonts.ts` (the curated 22) and `faces.ts`, their generated `metrics/`,
  `stickers.ts` (Phosphor icons plus deco corners), `placeholders.ts`
  (`{title}` ... `{last name}`, `possessive`), `text.ts` (layout),
  `scene.ts` (`layoutCard`), `paint.ts` (gradient geometry),
  `patterns.ts` (seeded, so every renderer draws the same confetti),
  `theme.ts` (the page theme, `themeCss`, `emailLook`), `basis.ts`
  (`basisOf`, the hash of the facts that says a card picture is stale),
  `qr.ts` (`hasPrintableQr`: a hidden, transparent or off-card code
  doesn't count), `warnings.ts` (`warningsOf`, warn or block before save),
  `templates/` (seven, in `templates/index.ts`), and the designer's pure
  editing logic (`editor.ts`: the reducer with undo and coalescing,
  cloning, restacking, aligning; `edit.ts`: handles, snapping, rotation).

`layoutCard` turns a design and the event's facts into a scene -- every line
break and every glyph's x, measured from metrics generated off the same
@fontsource files the page and the PDF use. It has three modes: `web`,
`paper` (adds the QR code and the print bleed, which `bleedOut` extends
edge-flush shapes into) and `image` (drops text that names the guest). An
element's `show` is `all`, `paper` or `screen`. Three renderers draw the
scene and nothing else:

- `components/design/card-svg.tsx` -- the guest page (laid out on the
  server in `invitePayload`), the designer, the editor's preview.
- `lib/design-pdf-core.ts` -- paper, in the browser; pure, so
  `scripts/render-design-samples.ts` renders every template from Node.
- `lib/design-canvas.ts` -- the one JPEG (`event.card_key`) for emails,
  texts, link previews and the dashboard, without `{guest}` or the QR code.

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
- `designs.save` is versioned: a stale version is CONFLICT, worded for
  "your other tab" or "a co-host". Unused uploads are pruned on save once
  an hour old (a co-host may be mid-edit with one). Old card pictures are
  kept because sent emails show them, but bounded (`routers/designs.ts`:
  the newest 30 after a save; past 200 files, those over 30 days go, and
  past that `uploadCard` refuses). Deleting an event empties its prefix.
- A paper event's design must have a printable QR code: `needsQr` in
  `design-rules.ts`, called on save and switching on (`routers/designs.ts`)
  and on send (`routers/events/sending.ts`).
- Fonts are faces "<id>-<weight>", with an "i" for italic (`parseFace`).
  Adding a font or weight to `FONTS` means installing its @fontsource
  package in `apps/web` and rerunning
  `pnpm --filter web exec tsx scripts/gen-design-fonts.ts` (then
  `pnpm run check`), which writes `metrics/`, `stickers.ts` and
  `lib/design-fonts.gen.ts`.
- A template can ship pictures (`Template.assets`, files under
  `apps/web/public/templates/<id>/`). Until picked it is previewed with
  stand-in refs that `designSrc` maps to those files; picking uploads each
  into the event like any image, so a saved design only names the event's
  own. The Night society template's art was cut from the host's own
  invitation picture.

### Uploads and pictures

- Every upload's type is decided by its bytes (`sniffImage` in
  `image-type.ts`), not the declared type: objects are served back with
  it. JPEG, PNG or WebP only; avatars JPEG only. Caps: 5 MB images, 600 KB
  MMS renditions, 1 MB avatars, 3 MB card pictures.
- Every picture gets a new random key, so it can be cached forever; the old
  object is deleted only after the new key is saved. Pictures are made in
  the browser (`lib/shrink-image.ts`, `lib/avatar-crop.ts`,
  `lib/design-canvas.ts`), never in the Worker, whose CPU budget is too
  small; the server takes only the finished file.
- `user.image` (Better Auth's column) is the profile picture's R2 key, not a
  URL; null shows initials. Only `api/src/avatar.ts` writes it, for the
  person (`account.setPicture`) or an admin (`people.setPicture`); hosts
  never, even before a sign-in. `erasePerson` deletes it. Show it through
  `Avatar`'s `image` (`components/brand.tsx`).
- MMS twins (`card_mms_key`, `cover_mms_key`) are a small rendition drawn
  beside the full picture; `mmsUrlOf` falls back to the original only when
  it is within 600 KB.

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
  morning's slot" instead.
- `siteInstant(date, time)` in `time.ts` converts the wall clock to a UTC
  instant with a two-pass offset fix. The second pass is what survives a
  daylight-saving weekend (November's repeated 1:30 is the first one,
  March's missing 2:30 an hour later). Tested; do not "simplify" it to one
  pass. `addDays` works in UTC dates on purpose.
- Host alerts for each reply are sent inline from `answer()`
  (`alertHosts`, skipping the replier), awaited, and never fail the answer.
- A notice about a change already saved (an update, a cancellation) goes
  through `notice()` in `api/src/mail.ts`: a failure is logged and
  reported as `noticeFailed`, never thrown, since thrown it would tell the
  host the save failed.

### Email

List sends go through `packages/api/src/mail.ts` → `Mailer.sendList`, which
batches up to 99 personalised copies per Brevo request using
`messageVersions`. The name goes in each copy's `to`; its `params` are only
`unsubscribeUrl` and `key`. Templates therefore contain the `PARAM`
placeholders from `packages/email/src/render.ts` (`{{ params.key }}`,
`{{ params.unsubscribeUrl }}`) rather than concrete URLs, and their output
must never be run through `escapeHtml`. Brevo runs its template language over
every part of a send, so person-typed text is `defuse`d (a zero-width space
after each `{`), and the mailer lets only those placeholders open a tag
(`guardTemplateSyntax`) as the backstop. Every list send writes one
`email_send` row (`EMAIL_KINDS` in `schema/email.ts`; host kinds are tagged
`audience: "hosts"`).

Email bodies stay light (dark backgrounds get mangled by mail clients' dark
modes); the brand is the plum band, the cover or card and the lime buttons.
Templates are built from blocks (text, typed, facts, buttons, pasteLink,
muted, custom), each rendered as both HTML and plain text. Colours come from
an `EmailLook` passed to the builders (`lookOf(row)` in `mail.ts`, from
`emailLook` in `@rsvp-site/design/theme`; null is After Dark), turned into a
palette inside `render.ts`; never recolour finished HTML.

Brevo POSTs are retried only on 429 and 503, which mean nothing was sent. A
timeout or another 5xx may come after Brevo accepted a 99-person batch, and a
retry would send it twice. Telnyx's `postMessage` follows the same rule.

### Texts

- `deliver` in `api/src/mail.ts` sends every event message (invite, nudge,
  reminders, update, cancel, host alert, digest): email and/or text per
  person by `channelsFor` (`api/src/channels.ts`, pure, tested; `purpose:
  "alerts"` uses the host's alert choice). Don't call `sendToList` for an
  event message; it is for the admin's broadcast. `deliver` returns null
  when nobody is reachable, and `failedIds` are the people no channel
  reached (the claims to give back). It makes every text's `/t/` link
  (`prepareTexts`) before any email leaves, so a D1 failure can't come
  after mail has gone and hand back claims for mail delivered;
  `sendPrepared` logs each text as it returns and never throws.
- `listTextable` / `textableWhere` sit beside `listRecipients` /
  `mailableWhere`: consent (`texts_ok_at`), texts on, a US number, not in
  `sms_block`. D1 refuses a long GLOB as "too complex", so the SQL checks
  the number's shape loosely and `textablePhone` exactly.
- Consent is the host's tick ("they expect a text from me") or the person's
  own switch, written only by `sms-status.ts`. A host's word only fills a
  blank on an unclaimed record and is cleared when the number changes
  (`updateDetails`).
- `sms_block` is per number, because STOP is: Telnyx blocks the number
  across the profile. Only START (`unblockNumber`) lifts a `stop`. Keywords
  match the whole message only, and YES is deliberately not one. Telnyx
  codes 40300 / 40001 / 40310-11 block as stop / landline / invalid.
- Text bodies are folded to GSM-7 (`toGsm`): one curly quote would make a
  160-character text a 70-character one. All start "Botch RSVP: "; all but
  the sign-in text end "Reply STOP to opt out."
- `text_link` codes are bearer credentials like `link_token`, which they
  copy; `redeemTextLink` requires the copy to match, so `rotateLinkToken`
  retires them. `/t/<code>` is served in `server.ts` before TanStack
  (GET only, throttled) and 302s to `/api/auth/link?...&via=text`. Never log
  one.
- Sign-in by text: `textSignIn` texts at most three people per number, ten
  minutes apart (read from `sms_send`), and checks `sms_block` first.
- `telnyx_event` claims inbound webhook ids so a redelivery is a no-op; the
  cron prunes rows over a week old on every pass.
- Log phones as their last four digits, never whole (`redactPhone`).

### The one-table people model

`user` is the accounts, the guests and the mailing list. A person is
`active` or `deactivated`, and separately may be unsubscribed
(`unsubscribed_at` + `unsubscribe_reason`: self, bounce, spam, invalid).

- `listRecipients` is the only query behind list sends and excludes
  deactivated and unsubscribed people whatever ids are passed. Use it.
- `banned` is a mirror of `status = 'deactivated'`, written in the same
  statement so Better Auth blocks the password door. It is nullable
  (migration 0000 lacked NOT NULL) — never compare it with `= 0`; `stillIn()`
  checks `status` alone for that reason.
- Self-service paths (`resubscribe`, the unsubscribe form, the Brevo
  webhook) never touch a deactivated row; the guards are in the `where`
  clauses. Turning email back on also calls `getMailer().unblock` (a Brevo
  404 there counts as done).
- Details (`first_name`, `last_name`, `phone`, the address columns) are
  the person's own, written only through `details.ts` and
  `findOrCreatePeople`; `name` is always rewritten beside the pair
  (`nameFor`), since Better Auth and every email read it. `claimed_at` is
  the first sign-in (the session-create hook): before it a host with them
  in their book may edit a plain guest's details, after it only they and
  an admin. `canEditDetails` decides and the UPDATE repeats the condition
  (`editable`), so a sign-in, a role change or a family move between the
  check and the write can't slip through; `details-guards.test.ts` tests
  the SQL. An address or a number is where sign-in links go, and any host
  can put anybody in their book by typing an address they know, so
  changing those two also needs `canEditReach`: the host is the one who
  typed them in (`user.created_by`). Every write of an address goes
  through `writeEmail` in `details.ts`; `changeEmail` answers `ok`, `same`,
  `taken` or `refused` and never guesses at merging two people. Pastes only
  fill blanks (`fillBlanks`, `fillPhone`), under the same guards. Phones
  are stored by `normalizePhone` and shown by `formatPhone`.
- `link_token` and `unsubscribe_token` are stamped at insert by
  `findOrCreatePeople`, and by the Better Auth hook for rows it makes.
- Workers' per-request (invocation) logs are off in `wrangler.jsonc`:
  sign-in and unsubscribe URLs carry their tokens. Log addresses through
  `redactEmail` (`@rsvp-site/email`) and numbers through `redactPhone`
  (`@rsvp-site/sms`), errors through `logError`, never a token or a `k=`
  URL.

### D1 limits

- A statement takes at most 100 bound parameters, and drizzle binds every
  column of every inserted row, literal defaults included. Bulk inserts go
  through `insertChunks(table, rows)` and long id lists through
  `mapChunks` (`@rsvp-site/db/batch`), or are replaced by a join.
- `db.batch` (atomic on D1) takes query builders, but drizzle 0.45 cannot
  batch raw `sql` with parameters: it fails at run time, not in the
  typecheck. Use `rawBatch(db.$client, [built(...), ...])` from the same
  module for a batch that mixes them (the potluck claim in `answers.ts`,
  the friend-invite cap in `guests.ts`).

## Adding things

Where a new piece goes, so it lands beside its siblings:

- **A procedure.** In the router for its concern (`routers/events/<concern>.ts`
  for events), on the narrowest procedure that fits. A host's event
  procedure is `hostProcedure.input(idInput...)` then `.use(withHostEvent)`
  or `.use(withLiveHostEvent)`. Shared input shapes are in `inputs.ts`; a rule
  worth testing goes in a pure module (`event-rules.ts` or its own) with a
  test, not in the handler. Anything that emails or texts an address
  somebody typed gets `requireUnderLimit`.
- **A column or table.** Schema in `packages/db/src/schema/`, then
  `db:generate` (see Commands), hand-check the SQL, `onDelete` on every
  foreign key, and run it locally. A person's column is written only by
  the module that owns that state; add a function there rather than an
  UPDATE in a router.
- **An event message.** The email builder in
  `packages/email/src/templates/event.ts` (with a test in
  `templates.test.ts`), the text in `packages/sms/src/templates.ts`, the
  kind in `EMAIL_KINDS` / `SMS_KINDS` (text enums, so no migration), and the
  send through `deliver` behind `emailsHeld` if guests receive it. A
  scheduled one also needs its stamp column and a case in `dueEmails`.
- **A page.** A file under `apps/web/src/routes/` (`_auth/` for signed in,
  `_admin/` for admins), `head()` titled with `pageTitle()`, built from
  `Page` / `PageHead` / `Panel` and the shared pieces below. Its pure logic
  goes in `lib/` with a test.
- **A design template.** A file in `packages/design/src/templates/`,
  registered in `templates/index.ts`; pictures under
  `apps/web/public/templates/<id>/` with stand-in refs. CI renders it to
  PDF at every layout.
- **A font.** See "Invitation designs".

## Conventions

- Biome: tabs, double quotes, `preset: recommended`, organize-imports on. Run
  `pnpm run check` while working, and `pnpm exec biome ci .` before pushing:
  that is what CI runs, and it is stricter -- it lints files `check` lets
  through (an SVG in `public/` needs a `<title>`, for one).
- TypeScript is strict with `noUncheckedIndexedAccess`, `noUnusedLocals` and
  `verbatimModuleSyntax` (use `import type`), the web app included: every
  tsconfig extends `packages/config/tsconfig.base.json`.
- Imports: `@/*` inside `apps/web/src`, `@rsvp-site/<pkg>/<module>` across
  packages (`@rsvp-site/db/people`, `@rsvp-site/ui/components/button`).
  Shared dependency versions come from the pnpm catalog
  (`pnpm-workspace.yaml`).
- Design system lives in `packages/ui/src/styles/globals.css`: After Dark,
  dark everywhere except a designed event's own pages, which override the
  tokens on `:root` (`DesignTheme`). Text on a lime or pink fill is
  `text-on-lime` / `text-on-pink` and lime or pink used as text is
  `text-lime-ink` / `text-pink-ink`, never `text-night` / `text-lime`, so
  a pale accent or a light page still reads. Text on an ink fill is
  `text-on-ink`. No literal colours in components. Unbounded headings
  (`font-heading`) over Manrope; tokens `bg-night`, `bg-panel`,
  `bg-panel-2`, `bg-panel-dim`, `border-line`, `border-line-strong`,
  `text-ink`, `text-soft`, `text-haze`, `bg-lime`, `bg-lime-soft`,
  `text-pink`, `bg-pink-soft`, shadows `shadow-lime` / `shadow-float`, plus
  `.kicker`, `.numeral` and `.tnum`. Lime is yes and the main action, pink
  is maybe and "send"; nothing else gets a color. Pills (`rounded-full`)
  for buttons and chips, ~26px radius for panels.
- Shared pieces (in `apps/web/src/components/`): `page.tsx` (`Page`,
  `PageHead`, `Panel`), `controls.tsx` (answer picker, stepper, switch,
  field), `response-bar.tsx`, `event-card.tsx`, `event-hero.tsx`,
  `event-crumbs.tsx` (the way back from an event's sub-pages),
  `confirm-action.tsx` (every inline "are you sure?", with a body when it
  needs one; it moves focus), `modal.tsx` (every dialog; closing it hands
  focus back), `person-details.tsx` (`DetailFields`, the name, phone and
  address fields), `invite/answer-flow.tsx` (the answer form and the panel
  after it), `texts-copy.tsx` (the texting consent wording, which carriers
  read: never write it out again), `brand.tsx` (wordmark, `Avatar`),
  `rename-input.tsx`, `tag.tsx`, `guest-picker.tsx`, `add-guests.tsx`,
  `notice.tsx`, `native-select.tsx`, `pill-tabs.tsx`, `stat-tile.tsx`.
  Pure helpers live in `lib/` with tests, not in component files. The
  editor is `components/event-editor/` (a draft hook, a save hook, a file
  per section); the designer's panels and hooks are in
  `components/design/`; the guest list's pieces and its pure sectioning in
  `components/guest-list/`. Button variants: default (lime), `send`
  (pink), `light`, `outline`, `pink`, `ghost`, `destructive`, `night`,
  `secondary`, `link`.
- `cn()` is shadcn's `cn` package, which merges Tailwind classes the way
  tailwind-merge does: a `leading-*` placed before a `text-*` size in the
  same `cn()` is dropped. Put leading after the size.
- Copy shared across pages lives in `apps/web/src/content/site.ts` (the
  landing page, `SITE_NAME` and `pageTitle()` for every `head()` title, the
  dry-run notice); a page's own words stay in the page. Time and formatting
  in `packages/api/src/time.ts` (`SITE_TIMEZONE`, `todayOnSite`,
  `formatDate`).
- Event `date` is a `YYYY-MM-DD` string and times `HH:MM`, both in
  `America/New_York`. Compare with `todayOnSite()`, not with `Date`.
- The countdown (`components/countdown.tsx`, `lib/countdown.ts`,
  `hooks/use-clock.ts`) is the app's only ticking UI. Seed its clock from the
  payload's `now` (and "today" from the payload's `today`), never
  `Date.now()` in render or a `useState` initializer, or the SSR markup and
  the hydration markup disagree. Every `toLocale*` call on a date passes
  `timeZone: "America/New_York"` for the same reason.
- **Drizzle only writes table-qualified column names when a query has a join.**
  A correlated subquery inside a `sql` template on a single-table `from` comes
  out as `where "event_id" = "id"` — both resolve against the subquery's own
  table, and it silently returns zeros. Either join and aggregate, or write
  the raw SQL with plain aliased names (what the potluck claim in
  `answers.ts` does).
- A check and its write go together: repeat the permission in the UPDATE's
  `WHERE`, claim with `UPDATE ... WHERE x IS NULL` and read
  `meta.changes`, and put a cap in the INSERT. A check in JS followed by an
  unconditional write is the race this codebase keeps removing.
- Comments here explain *why* a thing is the way it is (the security or
  operational reason), not what the code does. Match that when editing.
- **Commit and push straight to `main`.** No feature branches, no pull
  requests — one person maintains this and a review queue of one is just a
  delay. Nothing else looks at the change before it ships, so
  `pnpm exec biome ci .`, `pnpm run test` and a build are the gate; run them
  first.
- Commit messages are a declarative sentence ("The roster is the people who
  actually play"), then prose about *why*, in the same voice as the code
  comments. `git log` is the design record here; match it.
- When the code changes something either doc states, update the doc in the
  same commit: this file for rules and where things live, the README for
  what the site does and how to run it.
