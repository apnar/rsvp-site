# Botch RSVP

Party invitations with RSVPs, at **https://rsvp.botch.com**.

A host makes an event (a cover photo or a card they design, when and where,
what to ask, a potluck), invites people by email, text, a contact group or a
printed card, and watches the answers come in: yes, maybe or can't, with
plus-ones, kids, dietary needs and a note to the host. Reminders, change
notices and a morning digest go out on their own, from each event's own dates.

It started as a copy of [pickup-bball](https://github.com/apnar/pickup-bball),
the app behind a weekly basketball run, and the bones are the same: one
Cloudflare Worker, D1, R2, Better Auth with emailed sign-in links, and Brevo
for the mail. The model on top is its own: per-event guest lists, three roles,
households, paper invitations, a card designer and texts.

## Contents

- [What it does](#what-it-does)
- [Stack](#stack)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [How it is put together](#how-it-is-put-together)
- [People, roles and access](#people-roles-and-access)
- [Events and guests](#events-and-guests)
- [Invitation designs](#invitation-designs)
- [Email](#email)
- [The email schedule](#the-email-schedule)
- [Text messages](#text-messages)
- [Security in brief](#security-in-brief)
- [Database changes](#database-changes)
- [Deploying](#deploying)

## What it does

**For hosts**

- Make an event in a stepped editor: basics and cover photo, who's invited,
  the questions (plus-ones up to N, kids, dietary needs, a note), the answer
  words ("In / Maybe / Out", or the host's own, with maybe optional), a
  potluck, co-hosts and the email settings. Drafts save without a date.
- Design the invitation itself on a free canvas, from a template or blank,
  and have the guest page take on its colours and fonts.
- Invite by pasting lines in any shape (`Pat Smith <pat@x.com>`,
  `Pat Smith 301-555-0101`, a mail client's address list), from a private
  address book, from contact groups, or from families and groups an admin
  shared. Nobody hears anything until Send, and Send never invites anybody
  twice.
- Go paper instead: add guests by name alone, print a PDF of cards with a QR
  code on each, and start emails later, or never.
- Watch a live guest list in sections (yes, maybe, can't, viewed with no
  reply, not viewed), with headcounts, kids, diets by name, potluck claims,
  who answered for whom, how each guest arrived (email, text, card, direct),
  and a CSV export. Record an answer somebody phoned in. Nudge the quiet
  ones.
- Turn on a share link for strangers, or let chosen guests bring a few
  friends of their own.
- Cancel with a note to everyone still coming, or delete for good.

**For guests**

- No sign-up and no password: every link in every email or text signs them
  in. A password is there for anyone who wants one.
- Answer in a tap, change it until the party starts, claim a potluck slot,
  answer for relatives on the same list, and keep their own dietary needs on
  their profile, asked once and confirmed after.
- Choose email, texts or both, and unsubscribe in one click.

**For admins**

- Manage people (add, roles, pictures, new sign-in links, deactivate,
  delete), households (families), shared contact groups, and every event.
- Write to everyone, see the email log and the text log, and send a test text.

## Stack

| Layer | What |
|---|---|
| Runtime | One Cloudflare Worker (free plan), Workers Assets for static files, a half-hourly Cron Trigger |
| Pages | [TanStack Start](https://tanstack.com/start) (React 19, SSR) built with the Cloudflare Vite plugin |
| API | [Hono](https://hono.dev) at `/api/*`, [oRPC](https://orpc.unnoq.com) procedures at `/api/rpc`, TanStack Query on the client |
| Data | Cloudflare D1 (SQLite) through [Drizzle](https://orm.drizzle.team); R2 for pictures |
| Auth | [Better Auth](https://better-auth.com) with this site's own sign-in-link plugin |
| Messages | [Brevo](https://www.brevo.com) for email, [Telnyx](https://telnyx.com) for SMS/MMS |
| UI | Tailwind 4, base-ui/shadcn primitives, the "After Dark" tokens in `packages/ui` |
| Paper | pdf-lib in the host's browser; generated font metrics so SVG, PDF and canvas lay text out identically |
| Tooling | pnpm workspaces + Turborepo, Biome, Vitest, TypeScript (strict), GitHub Actions |

The scaffold came from
[Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack).

## Repository layout

```
rsvp-site/
├── apps/
│   └── web/            The one app: TanStack Start pages, the Hono API, the Worker entry
│       ├── src/routes/       Pages (file routes) and the /api catch-all
│       ├── src/components/   Shared pieces; editor, designer, guest list, invite, paper
│       ├── src/lib/          Pure helpers with tests (PDF layout, crop maths, formats)
│       ├── src/server/       Hono app, webhooks, unsubscribe pages, throttling
│       ├── src/server.ts     Worker module: fetch, /t/ links, canonical host, cron
│       ├── scripts/          Font-metric generator, PDF sample renderer
│       └── wrangler.jsonc    Worker name, bindings, vars, cron, rate limits
├── packages/
│   ├── api/            oRPC routers and the rules behind them: access, sending, schedule, headcount
│   ├── auth/           Better Auth factory and the email-link plugin
│   ├── db/             Drizzle schema, D1 migrations, and the modules that own a person's state
│   ├── design/         Invitation designs: schema, fonts and metrics, text layout, scene, templates
│   ├── email/          Brevo client, mailer, email templates, webhook decisions
│   ├── sms/            Telnyx client, text templates, segments, webhook signature and parsing
│   ├── env/            Typed Worker env, the site's origin, the dry-run gate
│   ├── ui/             Design tokens (globals.css) and shared primitives
│   └── config/         The shared tsconfig
└── .github/workflows/deploy.yml   Check on every push and PR; migrate and deploy from main
```

Libraries are consumed as TypeScript source through `exports` subpaths
(`@rsvp-site/db/people`, `@rsvp-site/ui/components/button`); only `apps/web`
builds.

## Getting started

You need Node 24 and pnpm 10 (`corepack enable` picks up the version pinned in
`package.json`). Nothing else: wrangler and workerd come in as dependencies,
and the local D1 and R2 live under `apps/web/.wrangler/`.

1. Install:

   ```bash
   pnpm install
   ```

2. Create `apps/web/.dev.vars` from `apps/web/.dev.vars.example` and set a
   random `BETTER_AUTH_SECRET` (`openssl rand -base64 32`). Leave
   `BREVO_API_KEY` and `TELNYX_API_KEY` empty: every email and text is then
   printed to the dev server's console, with the placeholders filled in so the
   sign-in link is clickable. That dry run only happens on localhost; anywhere
   else a missing key fails the send.

3. Apply the migrations to the local database:

   ```bash
   cd apps/web && pnpm exec wrangler d1 migrations apply DB --local
   ```

   (`pnpm run db:migrate:local` from the root does the same in a real
   terminal; turbo refuses it without one.)

4. Start the dev server. Vite runs the server side inside workerd, so the
   bindings behave as they do in production:

   ```bash
   pnpm run dev
   ```

   Open http://localhost:3001.

5. Make yourself an admin. Nobody can sign up, so the first account is
   written by hand, as described in
   [The first account](#the-first-account-on-an-empty-database) (drop
   `--remote`).

### Commands

| Command | What |
|---|---|
| `pnpm run dev` | Dev server, pages and API, at http://localhost:3001 |
| `pnpm run build` | Build the Worker bundle and static assets |
| `pnpm run check` | Biome: format, lint, organise imports (writes) |
| `pnpm exec biome ci .` | What CI runs; stricter than `check` |
| `pnpm run check-types` | `tsc --noEmit` across the workspace (builds the web app first for its route tree) |
| `pnpm run test` | Vitest in every package with tests |
| `pnpm run db:generate` | Generate a D1 migration from the Drizzle schema |
| `pnpm run db:migrate:local` / `:remote` | Apply migrations locally or to production |
| `pnpm run deploy` | Build and `wrangler deploy` |

Run one test file or one test:

```bash
pnpm --filter @rsvp-site/email exec vitest run src/links.test.ts
pnpm --filter @rsvp-site/api exec vitest run -t "dueEmails"
```

Run the cron against the dev server (it uses the real clock, so move an
event's dates in D1 to make something due):

```bash
curl "http://localhost:3001/cdn-cgi/local/scheduled?cron=0+*+*+*+*"
```

Peek at the local database:

```bash
pnpm --filter web exec wrangler d1 execute DB --local --command "select email, role from user"
```

### Tests

Every package with logic has tests, all of them pure: the email and text
templates, Brevo and Telnyx request shaping, sign-in link paths, address
parsing, roles, who can be reached, the SQL guards on who may edit whom,
headcount and potluck arithmetic, the schedule's timezone maths, event rules,
the webhooks' decisions, design validation, text layout, the scene, the
designer's editing logic and the web app's helpers. Nothing touches D1 or the
network, so a mistake only D1 makes (a raw-SQL batch, a statement over 100
parameters) shows up only when something writes through the dev server.
CI also renders every design template to PDF:

```bash
pnpm --filter web exec tsx scripts/render-design-samples.ts <out dir>
```

## How it is put together

The whole site is one Cloudflare Worker. `apps/web/src/server.ts` is its
module: it 301s any other host to the canonical one, answers `/t/<code>` text
links, hands everything else to TanStack Start, and runs the half-hourly
`scheduled` handler.

```
browser ──► Worker (server.ts)
              ├─ /t/<code>        → 302 to the sign-in link it stands for
              ├─ /api/*           → Hono (src/server/app.ts)
              │    ├─ /api/auth/*       Better Auth (+ the email-link plugin)
              │    ├─ /api/rpc          oRPC → packages/api routers → D1, R2, Brevo, Telnyx
              │    ├─ /api/covers|designs|avatars/…   pictures from R2
              │    ├─ /api/unsubscribe/:token          one-click unsubscribe pages
              │    ├─ /api/brevo/webhook, /api/telnyx/webhook
              │    └─ /api/health
              └─ everything else  → TanStack Start (SSR pages)
cron (0,30 * * * *) ──► scheduled → runEventMail, prune old Telnyx events
```

Pages and the API share an origin, so there is no CORS and the cookies are
ordinary same-site ones. During server rendering the pages call the oRPC
router directly, with no HTTP hop; in the browser they post to `/api/rpc`
with oRPC's CSRF header, which the handler requires.

### Pages

| Path | What | Who |
|---|---|---|
| `/` | Landing page | strangers (signed-in people go to `/events`) |
| `/login`, `/forgot-password`, `/reset-password` | Sign in by emailed or texted link, or password | anyone |
| `/terms`, `/privacy` | The legal pages | anyone |
| `/i/<token>` | A share link's teaser and join form | anyone with the link |
| `/p/<key>` | A printed card's invitation and answer form | whoever holds the card |
| `/confirm-email?k=` | Add an address a guest gave us, by button | whoever got the link |
| `/events` | Host dashboard (drafts, upcoming, past) or a guest's invitations; `?all=true` for an admin's every event | signed in |
| `/e/<id>` | The invitation and RSVP; hosts see it as a guest does, under a strip of controls | the event's guests, hosts, admins |
| `/e/new`, `/e/<id>/edit` | The event editor | hosts |
| `/e/<id>/guests` | The guest list | the event's hosts, admins |
| `/e/<id>/design` | The card designer (browser only) | the event's hosts, admins |
| `/contacts` | Address book and contact groups | hosts |
| `/account` | Details, picture, password, email/text choice, sign out everywhere | signed in |
| `/admin/users`, `/admin/families`, `/admin/groups`, `/admin/email` | People, households, shared groups, broadcast and logs | admins |

The route guards (`_auth`, `_admin`) only decide what renders; every
procedure checks again on the server, and an event you may not see answers
the same "not found" as one that doesn't exist.

### The API

The oRPC routers live in `packages/api/src/routers`:

| Router | For | What |
|---|---|---|
| `events.*` | hosts, guests, public | the dashboard, the editor, covers, sending and nudges, paper exports, the share link |
| `designs.*` | hosts | the design document, its images, the card picture, on/off |
| `guests.*` | hosts, guests | the list, adding and removing, recording answers; a guest's answer, views and friends |
| `contacts.*` | hosts, admins | the address book, groups, sharing groups |
| `families.*` | admins | households |
| `people.*` | admins, public | managing people; "email/text me my link" |
| `account.*` | signed in | the person's own details, picture, password, contact choice |
| `contact.*`, `diet.*` | guests | giving us a missing address or number; dietary needs for themselves and family |
| `paper.*` | a card's key | reading and answering one printed invitation |
| `mail.*` | admins | broadcast, previews, logs, a test text |

They are built on `publicProcedure`, `personProcedure`, `hostProcedure` and
`adminProcedure` (`packages/api/src/index.ts`). Every procedure that grants
anything re-reads the caller from D1, so a demoted host stops hosting on
their next request.

## People, roles and access

There is one table of people, `user`: the accounts, the guests and the mailing
list at once. Each person has a **role**:

| Role | Can |
|---|---|
| `user` (a guest) | answer the invitations they have, see those events, manage their own account |
| `host` | everything a guest can, plus make events, invite anybody, keep an address book and contact groups |
| `admin` | everything a host can, plus see and manage every event, add people, set roles, keep families and shared groups, deactivate or delete people |

Roles live in `user.role` (null reads as `user`) and are read through
`roleOf` / `canHost` / `isAdmin` in `packages/db/src/roles.ts`, which the web
app and the API share. Better Auth's admin plugin only knows `admin` and
`user`, so roles are written by `setRole` in `packages/db/src/status.ts`
(behind the admin's `people.setRole`), not by the plugin's.

- **Strangers** get the landing page, and a share link's teaser if they have
  one: cover, title, date and the host line. Never the address, the details or
  who is coming.
- **Guests** see an event only if they are on its list, and never a draft. A
  wrong id and an event that is not yours answer the same "no such event", so
  ids cannot be probed. Other guests' names show only when the host leaves
  "Show who's coming" on; counts always show; notes, dietary needs and
  addresses are for hosts, and dietary needs only on events that ask about
  them.
- **Hosts** see and run the events they host: the creator (owner) and any
  co-hosts, who must themselves be hosts. Admins see everything.
- **Families** (`family`, `family_member`) are households, kept by admins on
  `/admin/families`; a person is in at most one. Anybody in a family may
  answer, from the invite page or their printed card, for relatives who are on
  the same event's list and nobody else, and hosts see who answered
  (`event_guest.answered_by`). A member flagged a child counts as a kid when a
  relative answers for them; a family may hold name-only people (young kids)
  who are never emailed. Only an admin or the person themselves edits a family
  member's details.
- **Views.** Hosts see when each guest first opened their invitation
  (`event_guest.viewed_at`, and `last_viewed_at` in the CSV), and a "Viewed,
  no reply" filter. Only the guest's own visit counts, from the invite page or
  their card, and only once the page is on screen in a browser: the server's
  read records nothing, so mail scanners fetching a link don't count, and a
  host or admin looking at the page doesn't either. Each first look and each
  answer also records how the guest came (`viewed_via`, `responded_via`): an
  email link, a text link, their card's QR code, the site directly, or, for an
  answer, a host recording it. A sign-in link leaves a two-hour `arrived_via`
  cookie saying which kind it was.

### Accounts

**Nobody needs to sign up.** Public sign-up is closed
(`emailAndPassword.disableSignUp`). An account exists the moment somebody's
address or number is typed in: by a host inviting them or adding them to a
group, by an admin on `/admin/users`, or by the person themselves on a share
link. `findOrCreatePeople` in `packages/db/src/people.ts` writes the row
directly, tokens included (Better Auth's `createUser` is an admin endpoint and
would refuse a host), and records who typed them in (`user.created_by`).
Wherever a host adds people the box is free-form, one person per line:
`parseGuests` in `packages/db/src/addresses.ts` pulls out the address, a phone
number and the name (split into first and last at the last word; one word, or
a household like "The Parks", is a first name), and also reads a mail client's
`"Linh" <linh@x.com>, "Bo" <bo@x.com>` on one line.

**A person's details are theirs once they sign in.** First and last name,
mobile number and mailing address live on the `user` row, one copy every host
sees. Until somebody first signs in (`claimed_at`, stamped by the session
hook in `packages/auth`), a host who has them in their address book may
correct their name and address on `/contacts`. A pasted list only fills blanks
on people who already exist. After the first sign-in only the person (on
`/account`) and an admin (on `/admin/users`) can change anything. Hosts never
edit another host's or an admin's record. An address or a number is more than
a detail ("email me my link" and "text me my link" send a way in there), so
before the first sign-in only the host who typed the person in may change
those two (`canEditReach` in `packages/db/src/details.ts`). Changing a real
address replaces both of the person's tokens; changing it to an address that
is already somebody's moves that host's book entry and groups to that person
instead.

**Guests fill their own gaps.** After answering, a guest with no address or
no number is asked for it. A number is saved at once; an address gets a signed
link first, and is added by the button on `/confirm-email`.

**A profile picture is the person's own.** They put one up on `/account`
(pick a photo, then drag, zoom and turn it inside the circle), and an admin can
do it for anybody; hosts can't. It shows wherever the initials did. The
picture URL carries nothing but a random key.

**Every link in every email signs the reader in.** It carries their
`link_token`, a bearer credential, which is why the emails say not to forward
them. Passwords are optional: anyone can set one on `/account`, and the login
page sends a fresh link by email or text at most every ten minutes, saying
the same thing whether or not the address exists.

Sessions last 180 days and roll forward. There is no session cookie cache:
every request checks its session in D1, so signing out everywhere, a new
sign-in link or a deactivation ends the person's other sessions at once.

**Two switches, not states.** A person is `active` or `deactivated`;
separately, they may be **unsubscribed** (`unsubscribed_at`, with a reason:
self, bounce, spam, invalid).

- *Unsubscribed* stops the email and nothing else: they still sign in, and
  invitations still show up on the site and on the hosts' lists (marked "No
  email"). Set by the footer link, the account page, or Brevo's webhook;
  lifted from the account page or the footer's undo, which also lift Brevo's
  blocklist.
- *Deactivated* is the lockout, and only an admin sets or lifts it. It sets
  Better Auth's `banned` in the same statement (closing the password door),
  revokes every session, and makes emailed links land on
  `/login?error=revoked`. Nothing is deleted.
- *Deleted* is for good, and also admin only (People → Delete): the row goes,
  and D1's cascades take their invitations, answers, family membership,
  address-book entries, groups and sessions with it, so the address can come
  back later as a stranger. Events they own pass to the co-host who has hosted
  longest (if one may still host); events they host alone are deleted with
  them, and one guests are still expecting blocks the delete until it is
  canceled or given a co-host. The confirmation lists all of that first
  (`people.removal`). Brevo is not told: its blocklist keeps an address that
  unsubscribed or bounced unmailable if a host adds it again.

### The first account on an empty database

It cannot come from the site. Write your own row, then click your own link:

```bash
# 1. Put yourself in, as an admin, with a token to get in with.
pnpm --filter web exec wrangler d1 execute DB --remote --command "insert into user (id, name, email, email_verified, role, status, source, link_token, unsubscribe_token) values (lower(hex(randomblob(16))), 'Your Name', 'you@example.com', 1, 'admin', 'active', 'admin', lower(hex(randomblob(16))), lower(hex(randomblob(16))))"

# 2. Read the token back.
pnpm --filter web exec wrangler d1 execute DB --remote --command "select link_token from user where email='you@example.com'"
```

Open `https://rsvp.botch.com/api/auth/link?k=<that token>` (or
`http://localhost:3001/...` locally, without `--remote` above). Then make
hosts from `/admin/users`.

## Events and guests

- **An event** (`event`) is a draft until a host sends it. A draft can be
  saved without a date; sending needs one. Dates are `YYYY-MM-DD` and times
  `HH:MM` on the site's clock (America/New_York, `packages/api/src/time.ts`).
  A published event can be canceled (with an optional note to everyone still
  coming) and any event deleted for good, guest list, answers, potluck and
  pictures included. Any host may delete a draft; once it has gone out only
  the owner or an admin may (co-hosts can still cancel). Deleting one guests
  are still expecting cancels it first, with the same note and email
  (`callOff` in `packages/api/src/endings.ts`).
- **Details** come in two kinds. "The details" go wherever the invitation
  does: the invite page, the invitation and day-before emails, printed cards,
  and `{details}` on a designed card. "More details, on the invite page only"
  (`event.extra_details`) are shown only to guests who open the invite, under
  "Good to know": never emailed, printed or on the public share page, so a
  gate code stays with the people invited.
- **Answer words** are the event's own. Stored answers are always yes, maybe
  or no, but each event may call them anything (presets, or the host's words)
  and may leave maybe out; every page, email and text says them the event's
  way (`answersOf` in `packages/api/src/answer-words.ts`).
- **Hosts** are rows in `event_host`; the creator is `is_owner`. Co-hosts are
  added in the editor's "Hosts" step, by address or from the hosts in your
  address book. They must already be hosts on the site.
- **The guest list** is `event_guest`: one row per person per event, the
  invitation and the answer in one row. `response` null means "no reply";
  `invited_at` records when their invitation went out; `source` says how they
  got on (typed by a host, from a group, a friend a guest brought, or the
  share link). Nobody is contacted until the host presses Send, which reaches
  everyone not yet invited, exactly once.
- **Answering** (`guests.respond`) saves the answer, the party (adults
  including the guest, clamped to the event's plus-ones; kids), a dietary note
  for the uninvited people they bring, the note to the host and potluck picks
  in one go. Each person's own dietary needs (presets and a note) are on their
  profile, not the answer: after a yes or maybe the guest is asked whether
  theirs, and those of the relatives they answered for, are still right.
  Answers stay open until the party starts; the deadline is what the host asks
  for, not a lock. Every count any page or email shows comes from
  `packages/api/src/headcount.ts`.
- **Hosts can record answers.** The pencil on a guest row sets their answer
  and party, for the guest who phoned it in. The host is not held to the
  plus-one limit, no host alert fires, and a "can't" drops their potluck
  claims (`guests.setAnswer`).
- **The potluck** is `potluck_item` (label, how many) and `potluck_claim` (one
  per guest per item). A claim is an `INSERT ... SELECT` that only writes
  while the item has room, so two guests taking the last slot cannot both get
  it; the loser is told.
- **Paper invitations** are chosen per event while it is a draft. The host can
  add guests by email or **by name alone** (a `user` with `no_email` and a
  placeholder address at `no-email.invalid`, never mailed and never shown),
  and downloads a PDF of cards from the guest list: one guest's, or
  everybody's, at 5x7, letter, or half-letter two to a sheet. The PDF is built
  in the host's browser; the Worker's CPU budget is far too small. Each card's
  QR code is `/p/<event_guest.paper_token>`, a key per invitation, issued on
  first download and kept after, so printing again never breaks a mailed card.
  Because the host holds these keys, a key **signs nobody in**: it opens and
  answers that one invitation, and nothing else. Until the host presses
  **Start emails**, a paper event sends guests nothing (`emailsHeld` in
  `packages/api/src/schedule.ts`), and guests can't bring friends; Start
  emails sends the invitation to everyone with an address who hasn't already
  answered from their card. Host alerts and digests are never held.
- **Guests bringing guests** is off by default. With it on, a guest the host
  chose (typed in, or from one of the host's groups) gets a "Bring someone"
  form and may add up to the event's limit (default 3). Their friend goes on
  the list with `source = 'guest'`, gets the invitation at once naming who
  brought them, and can never invite anyone: one level and no further. The
  limit is checked inside the INSERT, so two quick invites cannot slip past
  it (`canInviteOthers` in `packages/api/src/guest-invites.ts`).
- **The share link** `/i/<share_token>` is off by default. A stranger sees the
  teaser and types their address; `events.join` (rate-limited per IP, and per
  address) emails them a sign-in link back to the same page, and a button
  there puts them on the list. A new token kills the old link and nothing
  else.
- **The address book** (`contact`) is each host's own list: everybody they
  have put on one of their events or in a group, plus anyone they add on
  `/contacts`. It fills itself (`remember` in `packages/db/src/address-book.ts`).
  Picks are checked against the caller's own book, so a guessed id adds
  nobody. Friends a guest brings and share-link joiners are not the host's
  choices and do not land in it.
- **Contact groups** (`contact_group`, `contact_group_member`) are made from
  the book; adding a group to an event copies its members onto the list. Both
  are private to their owner. An admin can **share** a family with every host,
  or a group with the hosts they pick (`contact_group_share`): those hosts may
  add its members to their events (`pickable` in
  `packages/db/src/families.ts`), but only the owner or an admin edits it.
- **Cover photos** are scaled down in the browser and stored in R2 under a
  random key, served at `/api/covers/<key>` with immutable caching. A new
  photo gets a new key; the old object is deleted.

## Invitation designs

Any host can open "Design it" in the editor's first step (`/e/<id>/design`): a
free canvas over a fixed-shape card (5x7 either way, 5.5" square, 8x10,
half-letter, letter) where text, uploaded images, shapes, stickers and, on
paper events, the QR code are dragged, resized and turned, with layers,
alignment, undo and keyboard shortcuts. Seven templates start it off (After
Dark, Garden party, Confetti birthday, Minimal, Disco night, Photo poster,
Night society). A page theme (five colours, two fonts from a curated 22)
dresses the rest of the guest page, and its colours carry into the emails.

Text can carry `{title}`, `{date}`, `{time}`, `{location}`, `{host}`,
`{rsvp by}`, `{details}`, `{guest}`, `{first name}` and `{last name}`, filled
from the event and the reader (or, on paper, the addressee); `{guest's}` and
`{first name's}` are the name made possessive the way it is written (Josh’s,
James’s, The Nguyens’).

The document is `event_design` (JSON, validated by `@rsvp-site/design` on
every save, versioned so a co-host's save is never silently overwritten);
`event.design_on` says whether guests see it. One scene, laid out in
`packages/design` with font metrics generated from the same font files the
page and the PDF use (every line break and every glyph's position, kerning
included), is drawn three ways:

- **SVG** on the guest page (laid out on the server) and in the designer.
- **pdf-lib** for paper, in the host's browser, with native gradients and an
  optional print-shop bleed with crop marks.
- **A canvas JPEG** (`event.card_key`) for emails, texts, link previews and the
  dashboard. It bakes in the event's facts, so it is redrawn after design
  saves and fact changes, and by the guest list whenever `card_basis` says it
  is stale.

Images live in R2 under `designs/<event id>/` (uploads never SVG), are pruned
when unused for an hour, and go with the event. A paper event's design must
carry a printable QR code to save, switch on or send.

## Email

Brevo delivers; the app owns the list, the templates and the log.

- **Who gets it.** `listRecipients` (`packages/db/src/people.ts`) is the one
  query behind every list send, and it never returns anybody deactivated or
  unsubscribed, whatever ids are asked for. Event messages go through
  `deliver` (`packages/api/src/mail.ts`), which picks email, text or both per
  person.
- **How a link signs you in.** Every link in a list email points at
  `/api/auth/link?k=<link_token>&to=<path>`, a GET endpoint added by the
  `email-link` plugin in `packages/auth/src/link.ts`. It finds the person,
  marks the address verified (unless the link came by text or the address is a
  placeholder), opens a session and redirects to `to`, checked by
  `safeReturnPath`. An unknown token lands on `/login?error=link`, a
  deactivated one on `/login?error=revoked`.
- **Answer buttons never answer.** Yes / Maybe / Can't in an email land on
  `/e/<id>?a=yes`, which shows that answer picked and waits for a tap. Mail
  clients prefetch link targets; a GET that saved would answer for people who
  never clicked. The unsubscribe footer works the same way: the GET shows a
  button, the POST acts.
- **What goes out.**
  - *Invite*: when a host presses Send, to everyone on the list not yet invited.
  - *Deadline reminder*, *day before*: from the cron; see below.
  - *Nudge*: a host pressing Nudge, to people with the invitation and no
    answer; each person at most once every twelve hours.
  - *Change of plans*: when a sent event's date, time or place changes and
    "Tell guests about changes" is on, to everyone who has not said no.
  - *Canceled*: to everyone who has not said no, with the host's note.
  - *Host alert* / *host digest*: to the event's hosts, for each reply or once
    a morning, per the event's setting.
  - *Share link*: the sign-in link a stranger asked for on `/i/<token>`.
  - *Welcome*: an admin adding somebody or resending their link, or "Email me
    a link" on `/login`.
  - *Confirm address*: the link a guest gets after giving us their address.
  - *Message*: an admin writing to everybody on `/admin/email`, with "Send to
    me first".
  - *Password reset*: Better Auth's.
- **Look.** The site is dark; the email body is not. Gmail and Outlook rewrite
  dark backgrounds in their dark modes, so emails get a plum band with the
  wordmark, the cover or card, lime buttons and a white body
  (`packages/email/src/render.ts`). An event with a design lends the email its
  colours.
- **Sender.** `"Botch RSVP" <info@rsvp.botch.com>`
  (`packages/email/src/sender.ts`), in this site's own Brevo account, not
  pickup-bball's: Brevo applies blocklists, webhooks and keys account-wide.
  DKIM records live in the `botch.com` Cloudflare zone, and Cloudflare Email
  Routing forwards replies to `info@` to a person.
- **Log.** Every list send writes one `email_send` row (kind, event, subject,
  recipient count, failures, Brevo message ids). `/admin/email` shows the last
  thirty.
- **Batching and personalisation.** One Brevo request carries up to 99
  personalised copies (`messageVersions`). Each copy gets the recipient's name
  and two params, `unsubscribeUrl` and `key`; the last turns the shared
  template's links into that one person's sign-in links. A POST is retried
  only on 429 and 503, which mean nothing was sent.
- **Brevo's own unsubscribe.** Brevo adds a `List-Unsubscribe` header to every
  email and tells the app through `/api/brevo/webhook`
  (`apps/web/src/server/brevo-webhook.ts`): unsubscribe, hard bounce, spam
  complaint and invalid address all unsubscribe the address with that reason,
  never a deactivation.

Setting it up:

1. In Brevo, create a v3 API key (Account > SMTP & API > API keys).
2. Production: `pnpm --filter web exec wrangler secret put BREVO_API_KEY`.
3. The webhook: pick a random token, set it with
   `pnpm --filter web exec wrangler secret put BREVO_WEBHOOK_SECRET`, then
   register the webhook once:

   ```bash
   curl -H "api-key: $BREVO_API_KEY" -H "content-type: application/json" https://api.brevo.com/v3/webhooks \
     -d '{"url":"https://rsvp.botch.com/api/brevo/webhook","type":"transactional","events":["unsubscribed","hardBounce","spam","invalid"],"auth":{"type":"bearer","token":"<the token>"}}'
   ```

   Without the secret the route answers 404, so a missing webhook never breaks
   anything else.

Keep `BREVO_API_KEY` out of the local `.dev.vars`. With a key there, a local
"test" send (or a local cron run) mails everybody in the local database for
real.

Brevo offers an MCP server for inspecting an account from Claude Code. That
registration is per machine, not per repo; on a machine where it points at
pickup-bball's Brevo account, it shows that account and not this one, so
anything done through it changes the wrong site.

## The email schedule

Each event's own settings decide its automatic messages. The half-hourly cron
asks `dueEmails` in `packages/api/src/schedule.ts` what each published event
has due, on the site's clock:

| Message | When | To |
|---|---|---|
| Deadline reminder | 10:00 AM, N days before the RSVP deadline (N per event, default 3) | invited, no answer |
| Day before | 10:00 AM the day before | yes and maybe |
| Host digest | 8:00 AM daily, through the morning after the party, if the event asks for it | the hosts, with the replies since the last one |

Rules, all unit-tested in `packages/api/src/schedule.test.ts`:

- **A stamp means resolved, not sent.** Each message stamps a column on
  `event` when it is handled. One whose moment has passed (the deadline went
  by, the party started, or the event was only published after the reminder
  was due) is stamped without sending, so the job does not retry it every
  half hour. `email_send` is the record of what went out.
- **Moving the date or the deadline re-arms** the reminders that belonged to
  the old one.
- **Read, claim, send.** `jobs/event-mail.ts` reads who it would go to, claims
  the stamp with `UPDATE ... WHERE col IS NULL` (`meta.changes === 1` is the
  lock), sends, and gives the stamp back if nothing went. The digest repeats,
  so its claim is "older than this morning's slot" instead. Two overlapping
  passes cannot both send.

## Text messages

Telnyx delivers texts; the app decides who gets one and keeps the log and the
opt-outs. Every event message goes through `deliver`, which sends each person
the channels `channelsFor` (`packages/api/src/channels.ts`) picks: their own
choice on the account page (email, text or both), or by default email when
they can get it and a text when they can't.

- **Who can be texted.** `textableWhere` (`packages/db/src/reach.ts`, with its
  JS twin `isTextable`): a US number, not deactivated, texts not switched off,
  the number not in `sms_block`, and consent on record (`texts_ok_at`).
  Consent is a host ticking "they expect a text from me" when adding numbers,
  or the person switching texts on. A host's word only fills a blank on a
  record nobody has claimed, and goes when the number changes.
- **Guests by phone.** "Pat Smith 301-555-0101" on its own line makes a guest
  with that number. A number already in the host's book is that person.
- **Links.** Each text carries `/t/<code>` (`text_link`), a 12-character
  stand-in for the email's sign-in link, which the Worker entry redirects to.
  A code holds a copy of the person's `link_token` and works only while they
  match, so a new sign-in link retires every code.
- **Pictures.** Invitations go as MMS with the card (design on) or the cover:
  a small rendition drawn in the browser, or the original if it is 600 KB or
  less, otherwise no picture. Everything else is plain SMS, folded to GSM-7 so
  one curly quote doesn't halve a segment.
- **STOP, START, HELP.** Telnyx answers them and blocks a STOPped number
  itself; the webhook (`apps/web/src/server/telnyx-webhook.ts`, Ed25519-signed)
  mirrors that into `sms_block`, which is per number, not per person. A final
  failure that says landline or invalid number blocks it too. Anything else
  texted in is emailed to `info@` and gets one "we can't read replies" a day.
- **Sign-in by text.** The login page's field takes a number:
  `people.requestTextLink` texts a link for each active person with it (at
  most three), once per ten minutes per number.
- **Log.** One `sms_send` row per text, written as each send returns and
  updated by the webhook (queued, sent, delivered, failed with Telnyx's code).
  Inbound texts are claimed by Telnyx's event id (`telnyx_event`, kept a week)
  so a redelivery forwards nothing twice. Hosts see the last text per guest;
  `/admin/email` lists the recent ones and sends a test to your own phone.

Setting it up:

| What | Value |
|---|---|
| Number | +1 301-279-8944, messaging profile "RSVP" (`4001a103-e3d4-43c7-865b-6154c3154cc1`) |
| Webhook | `https://rsvp.botch.com/api/telnyx/webhook`, set on the profile |
| Vars | `TELNYX_FROM`, `TELNYX_PUBLIC_KEY` in `wrangler.jsonc` (the public key is from `GET /v2/public_key`) |
| Secret | `TELNYX_API_KEY`: `pnpm --filter web exec wrangler secret put TELNYX_API_KEY < ~/.config/rsvp-site/telnyx-key` |

To test the webhook locally, put a test key pair's public half in `.dev.vars`
as `TELNYX_PUBLIC_KEY` and sign `<timestamp>|<body>` with the private half.

Costs, roughly: $0.004 per SMS segment and $0.015 per MMS, plus carrier fees
(about $0.003-0.005 per SMS, $0.007-0.01 per MMS). The profile has a daily
spend limit of $10, enough for an MMS invitation to about 400 people; a send
past it fails with 40333 until the next day. Its HELP, STOP and START replies
are the campaign's, set on the profile's auto-response configs.

### 10DLC registration

US carriers refuse texts from an unregistered local number (Telnyx error
40010). Registered through the API on 2026-10-05; the campaign was approved
and the number attached on 2026-10-08, and the first real text was delivered
that day.

| What | Value |
|---|---|
| Brand | sole proprietor "Botch RSVP", `4b2001a1-0cad-6873-929a-b9bfcaa9eead` (TCR `BH1KGAH`), identity verified by the PIN texted to the owner's mobile |
| Campaign | `4b3001a1-0cb2-863b-6c18-b6c494eda28b` (TCR `C9QATYC`), use case `SOLE_PROPRIETOR` (the only one a sole-proprietor brand may use), sub-use case `ACCOUNT_NOTIFICATION`; $24 a year |
| Number | +1 301-279-8944 is the campaign's one number (a sole-proprietor campaign carries exactly one; see `GET /v2/10dlc/phone_number_campaigns/+13012798944`). Carriers cap it at about 15 texts a minute on AT&T and 1,000 a day on T-Mobile |

Two things that bit: the portal saved the brand's mobile number without its
`1` (`+30...`, read as Greece), which the registry refused as "not a mobile",
and an update didn't fix it, so the brand was deleted and created again
through the API with `+1...`. And Telnyx won't submit a campaign with less
than $30 on the account.

What the campaign says (`POST /v2/10dlc/campaignBuilder`):

- **Description:** Botch RSVP (rsvp.botch.com) is a small party-invitation site run by Joshua Lukens. Hosts invite friends and family to their own gatherings. Guests receive the invitation by text with a link to view it and RSVP, followed by reminders before the RSVP deadline and the day before, notices if the date, time or place changes or the event is canceled, and sign-in links they request. Hosts can choose to get a text when a guest replies. No marketing or promotional messages are sent.
- **How people opt in:** A host adds a guest's mobile number to an invitation on rsvp.botch.com and must tick the box "The people whose numbers I added expect a text from me about this" before it can be sent; hosts invite people they know personally. The first text names the host and the event and ends "Reply STOP to opt out". People can also turn texts on or off themselves on their account page, and request a sign-in link by entering their own number at rsvp.botch.com/login. Terms: https://rsvp.botch.com/terms. Privacy: https://rsvp.botch.com/privacy.
- **Samples:**
  1. Botch RSVP: Josh invited you to Halloween Party, Sat, Oct 31 at 7:00 PM. See the invitation and RSVP: https://rsvp.botch.com/t/Ab3dE5fG7hJ9 Reply STOP to opt out.
  2. Botch RSVP: Please RSVP by Sat, Oct 24 for Halloween Party, Sat, Oct 31 at 7:00 PM: https://rsvp.botch.com/t/Ab3dE5fG7hJ9 Reply STOP to opt out.
  3. Botch RSVP: Tomorrow: Halloween Party at 7:00 PM, 12 Elm St. Details: https://rsvp.botch.com/t/Ab3dE5fG7hJ9 Reply STOP to opt out.
  4. Botch RSVP: Pat Smith answered Yes (2 adults) for Halloween Party. Guest list: https://rsvp.botch.com/t/Kx2mP9qR4sT7 Reply STOP to opt out.
  5. Botch RSVP: your sign-in link: https://rsvp.botch.com/t/Zq8wE3rT6yU1 Didn't ask? Ignore this.
- **Flags:** embedded links yes, embedded phone numbers no, age-gated no, direct lending no, affiliate marketing no, opt-in, opt-out and help yes.
- **Keywords:** HELP, INFO; START, UNSTOP; STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT.
- **Help:** Botch RSVP: party invitations and RSVP updates. Help: info@rsvp.botch.com. Msg&data rates may apply. Reply STOP to opt out.
- **Opt-in:** Botch RSVP: texts are back on. Msg&data rates may apply. Reply HELP for help, STOP to opt out.
- **Opt-out:** Botch RSVP: you won't get more texts from us. Reply START to get them again.

## Security in brief

The site holds people's addresses, numbers and sign-in links, so a few rules
run through all of it:

- **Links are credentials.** `link_token` (in every email link), `text_link`
  codes and printed-card keys are bearer secrets. They never go on a URL meant
  to be shown around, never into a cookie the browser can read, and never into
  a log. Workers' per-request logs are off for that reason, and errors are
  logged through one helper that leaves out a failed query's bound
  parameters (addresses, numbers, tokens).
- **GETs don't write.** Mail clients and scanners prefetch links, so answer
  buttons, unsubscribe links and views all wait for a tap or for the page to
  be on screen; even a signed-in person on a share link joins by button.
- **One answer for "no".** A stranger to an event gets the same "not found" as
  a wrong id; "email me my link" says the same thing for any address and does
  its work in the background, so timing says nothing either.
- **Rate limits** (Cloudflare's, keyed by `cf-connecting-ip`) on password and
  link sign-in, resets, text codes, the share link's form, a card's contact
  form, guests inviting friends and anything else that emails or texts an
  address somebody typed.
- **Check and write together.** Who may change a record is repeated in the
  UPDATE's own `WHERE`, so a sign-in or a role change between the check and
  the write can't slip through; claims (`UPDATE ... WHERE x IS NULL`) make
  every send happen once.
- **CSRF.** `/api/rpc` requires oRPC's CSRF header, because other `botch.com`
  sites are same-site and get the Lax cookies.
- **Uploads** are sniffed by their bytes, never SVG, stored under random keys,
  and served with immutable caching and nothing else attached.

## Database changes

1. Edit the schema in `packages/db/src/schema`.
2. Generate a migration: `pnpm run db:generate`. It writes SQL into
   `packages/db/src/migrations`, which is what wrangler applies. drizzle-kit
   asks "created or renamed?" without a TTY; see CLAUDE.md for running it from
   a script and for the hand edits D1 needs.
3. Apply it locally (`pnpm exec wrangler d1 migrations apply DB --local` in
   `apps/web`). CI applies it to production on the next push to `main`, before
   the new Worker deploys, so a migration that drops something the running
   code reads ships in two steps: first the code that stops reading it, then
   the migration.

## Deploying

### Automatic deploys

`.github/workflows/deploy.yml` runs on pushes to `main`, on pull requests and
by hand. The `check` job installs, runs `biome ci`, the unit tests, a build
(which generates the route tree the typecheck needs), the typecheck, and
renders every design template to PDF. On `main`, the `deploy` job then
builds, applies pending D1 migrations and deploys the Worker with Cloudflare's
`wrangler-action` (actions are pinned to commits, since that job holds the
token).

It needs one repository secret, `CLOUDFLARE_API_TOKEN`: a token from the "Edit
Cloudflare Workers" template with **D1: Edit** and **Workers R2 Storage:
Edit** added. Without it the deploy job fails. The account id is in
`apps/web/wrangler.jsonc`.

You can still deploy by hand from `apps/web` with `pnpm run deploy`.

### Production

| What | Value |
|---|---|
| Worker | `rsvp-site`, custom domain `rsvp.botch.com`; `rsvp-site.jlukens.workers.dev` 301s to it |
| D1 | `rsvp-site-db` (binding `DB`) |
| R2 | `rsvp-site-media` (binding `MEDIA`): `covers/`, `designs/<event id>/`, `avatars/` |
| Rate limits | `JOIN_LIMITER` (5 a minute), `AUTH_LIMITER` (10 a minute) |
| Cron | `0,30 * * * *` |
| Secrets | `BETTER_AUTH_SECRET`, `BREVO_API_KEY`, `BREVO_WEBHOOK_SECRET`, `TELNYX_API_KEY` |
| Vars | `BETTER_AUTH_URL`, `TELNYX_FROM`, `TELNYX_PUBLIC_KEY` |

### Setting up from nothing

1. Log in: `pnpm --filter web exec wrangler login`.
2. Create the database: `pnpm --filter web exec wrangler d1 create rsvp-site-db`
   and paste the returned id into `database_id` in `apps/web/wrangler.jsonc`.
3. Create the bucket: `pnpm --filter web exec wrangler r2 bucket create rsvp-site-media`.
4. Set the secrets: `pnpm --filter web exec wrangler secret put BETTER_AUTH_SECRET`,
   and the same for `BREVO_API_KEY`, `BREVO_WEBHOOK_SECRET` (see
   [Email](#email)) and `TELNYX_API_KEY` (see [Text messages](#text-messages)).
5. Set `BETTER_AUTH_URL` in `wrangler.jsonc` `vars` to the site's URL; every
   other host is redirected there.
6. Apply the migrations (`pnpm exec wrangler d1 migrations apply DB --remote`
   in `apps/web`) and deploy (`pnpm run deploy` there).
7. Write the first admin by hand
   ([The first account](#the-first-account-on-an-empty-database)), then add
   everyone else from `/admin/users`.
