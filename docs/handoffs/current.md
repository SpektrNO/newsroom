# Handoff: Elegant feed, topics, sources UI

**Status:** done  
**Created:** 2026-07-24  
**Specifier agent:** spec complete  
**Developer agent:** complete

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `web-feed-topics-sources` |
| Parent issue | UNKNOWN — GitHub Issues API returns 403 (`Resource not accessible by integration`) for this environment’s `gh` token. PRs/git push work; issue read/write does not. Do **not** invent issue numbers. |
| Open tasks | _(none)_ |
| Closed tasks | `spec` (handoff authoritative), `api`, `web`, `verify`, `docs` — Issues close/status scripts skipped (403) |
| Backlog | `docs/feature-backlog.md` § C — marked ✅ via `record-feature-complete.sh` |

Task order for this **web** feature (from `create-feature-issues.sh`): `spec` → `api` → `web` → `verify` → `docs`  
(No `audit`, `db`, `worker`, or `mobile` slugs.)

Phase-1 note: Issues status scripts/`gh issue` blocked by 403. Spec handoff is authoritative; reopen/close task issues when token gains Issues access.

## Intent

Signed-in users read a calm, editorial personal feed and manage topics and sources in the Next.js web app — using the existing session-scoped feed/topics/sources APIs — without a dashboard card wall.

## User-facing spec

| Field | Value |
|-------|-------|
| Trigger | After Better Auth sign-in; user opens web app (`apps/web`) to read ranked stories and configure topics/sources. |
| Surfaces | **Web only** (`apps/web` UI + thin `api` glue if needed). Consumes existing `/api/feed*`, `/api/topics*`, `/api/sources*`, `/api/health`, Better Auth. Prefer `packages/api-client` from the browser (credentials include). **No** worker/mobile work. **No** new domain tables. |
| Copy | Exact strings in **Copy** below. |
| Acceptance | See **Acceptance criteria** below. |

### Routes & information architecture

| Route | Auth | Purpose |
|-------|------|---------|
| `/` | Public landing if signed out; **Feed home** if signed in | Brand-first entry; authenticated users land on the ranked feed |
| `/sign-in`, `/sign-up` | Public | Keep existing email/password flows; after success → redirect to `/` (feed) |
| `/topics` | Session required | List / create / edit / enable-disable / delete topics |
| `/sources` | Session required | List / add / enable-disable / delete HN + Substack subscriptions |
| `/settings` | Session required | Account email, sign out, read-only system health |

**Chrome (authenticated):** Persistent top masthead with brand **Newsroom** (display weight — not a tiny nav label), primary nav links `Feed` · `Topics` · `Sources` · `Settings`, and a quiet sign-out affordance (Settings and/or masthead). Unauthenticated `/` keeps a brand-first composition (no app chrome).

**Guards:** Unauthenticated visits to `/topics`, `/sources`, `/settings` → redirect to `/sign-in` (preserve `callbackUrl` or equivalent so post-login returns). Signed-in `/` shows feed, not the placeholder “Feed UI arrives later” panel.

### Visual direction (normative)

Align with `docs/architecture.md` Clients note and the shipped auth aesthetic (Fraunces + Source Sans 3, teal accent, soft atmospheric gradients in `globals.css`):

1. **One editorial composition** — Feed reads as a reading list / broadsheet *feel without* dense newspaper columns, hairline-rule grids, or a wall of equal cards.
2. **Brand first** — On feed home, **Newsroom** is a hero-level masthead signal; no competing marketing headline that overpowers the brand.
3. **No card wall** — Story rows use typography + spacing + optional hairline separators. Do **not** wrap each story in bordered/shadowed cards. Forms on Topics/Sources may use a single restrained panel where interaction needs a container (match existing `.panel` sparingly).
4. **Atmosphere** — Keep soft multi-stop background (gradients / subtle wash). Avoid flat single-color page fills. Avoid purple/indigo “AI default,” glow stacks, and dark-mode-as-default.
5. **Motion** — At least 2–3 intentional motions (e.g. masthead/nav appear, feed rows fade/slide in staggered lightly, button/status feedback). No noise animations.
6. **Responsive** — Usable on mobile viewport: single column feed; nav collapses cleanly (simple wrap or compact links — no hamburger mega-menu required).

Evolve CSS variables from existing `:root` rather than inventing a second design system. Do not call Ollama or ranking from UI packages.

### Feed home (`/`)

**Layout (first viewport):** Brand masthead + nav; then the feed list begins. Do **not** pack stats strips, schedule callouts, or multi-widget dashboards above the fold.

**Filters (secondary, under masthead):**

- Topic: “All topics” + one option per user topic (filter via `GET /api/feed?topic=<topicId>`).
- Source: “All sources” · “Hacker News” · “Substack” (`?source=hackernews|substack`).
- View: “Feed” (default — excludes `dismissed`) · “Saved” (only `status=saved` — requires thin API support; see contract).

**Story row** (each `FeedItem`):

| Element | Behavior |
|---------|----------|
| Title | Link to `canonicalUrl` (`target="_blank"` `rel="noopener noreferrer"`). Opening title → fire `POST .../seen` (optimistic OK; ignore duplicate). |
| Reason | Show `reason` when non-null, muted one-line under title. |
| Meta | Source label(s) from `sources[].sourceType` (`Hacker News` / `Substack`), optional `author`, relative or short `publishedAt`. |
| Status | Quiet indicator for `saved` (and optionally `seen`). Do not show raw scores (`keywordScore` / `aiScore` / `finalRank`) in v1 UI. |
| Near-dup | If `nearDuplicateOfArticleId` set, show muted note: “Similar to another story in your feed.” (no need to resolve peer title). |
| Actions | **Save** → `markFeedSaved`; **Dismiss** → `markFeedDismissed` and remove row from default Feed view. Saved view: allow **Dismiss** and optionally un-save by… **v1:** Dismiss only from Saved (no toggle-off-saved API beyond setting another status — use **Seen** control “Remove from saved” → `markFeedSeen` to leave Saved filter). |

**Pagination:** When `nextCursor` non-null, show **Load more** that appends `listFeed({ cursor, topic?, source?, status? })`.

**Empty / loading / error:**

| State | UI |
|-------|-----|
| Loading initial | Soft placeholder lines or “Loading your feed…” — not a spinner-only void. |
| Empty feed (no items, no filters) | “Your feed is quiet.” + supporting: “Add topics and sources, then let ingest and ranking run. Seeded demos: try Topics and Sources after `pnpm db:seed` and `pnpm worker:ingest` / `pnpm worker:rank`.” CTAs: links to `/topics` and `/sources`. |
| Empty with filters | “No stories match these filters.” + control to clear filters. |
| Error (network / 401 / 5xx) | “Couldn’t load your feed.” + **Try again**. On 401 → redirect sign-in. |
| Action failure | Inline error on the row: “Couldn’t update — try again.” |

### Topics (`/topics`)

- List topics: name, keywords (comma-separated chips or plain text — **not** card grid), weight, enabled toggle, edit/delete.
- **Create:** form fields Name, Keywords (comma- or enter-separated → string[]), Weight (default 1, clamp 0.1–10), Enabled (default on).
- **Edit:** same fields via inline expand or same-page form (no heavy modal required).
- **Delete:** confirm (“Delete topic “{name}”?”) then `DELETE /api/topics/:id`.
- **Duplicate name** (`409`): “You already have a topic with that name.”
- **Validation** (`400`): “Check the name and keywords.” Map `invalid_topic` / API codes to that copy.
- Empty: “No topics yet. Create one so ranking knows what you care about.”

### Sources (`/sources`)

- List subscriptions: type label, config summary (HN mode `top`/`new` if set; Substack `rssUrl`), enabled toggle, delete.
- **Add Hacker News:** allow at most one HN subscription (API `409` duplicate) — if one exists, hide/disable Add HN and show helper text “Hacker News is already connected.”
- **Add Substack:** require RSS URL field; POST `{ sourceType: "substack", config: { rssUrl } }`.
- Enable/disable via `PATCH`; delete with confirm.
- Errors: `duplicate` → “That source is already added.”; `invalid_config` / bad URL → “Check the RSS URL.”; `unsupported_source_type` → “That source isn’t available yet.”
- Empty: “No sources yet. Connect Hacker News or a Substack RSS feed.”
- Bluesky/X: not offered in UI (no teaser required).

### Settings (`/settings`)

- Show signed-in email (from Better Auth session).
- **Sign out** button → `authClient.signOut()` → `/sign-in`.
- **System** read-only: `GET /api/health` — show Database and Ollama as Ok / Unavailable (map `ok`/`error`). Do not imply the user can fix Ollama from UI.
- No password change / OAuth / profile edit in this feature.

### Copy (exact UI strings)

| Context | String |
|---------|--------|
| Brand | `Newsroom` |
| Nav | `Feed`, `Topics`, `Sources`, `Settings` |
| Feed empty title | `Your feed is quiet.` |
| Feed empty body | `Add topics and sources, then let ingest and ranking run.` |
| Feed load error | `Couldn't load your feed.` |
| Feed retry | `Try again` |
| Load more | `Load more` |
| Save action | `Save` |
| Dismiss action | `Dismiss` |
| Remove from saved | `Remove from saved` |
| Near-dup note | `Similar to another story in your feed.` |
| Filter all topics | `All topics` |
| Filter all sources | `All sources` |
| Source HN label | `Hacker News` |
| Source Substack label | `Substack` |
| View Feed | `Feed` |
| View Saved | `Saved` |
| Topics empty | `No topics yet. Create one so ranking knows what you care about.` |
| Topics create CTA | `Add topic` |
| Topics delete confirm | `Delete topic "{name}"?` |
| Topics duplicate | `You already have a topic with that name.` |
| Topics invalid | `Check the name and keywords.` |
| Sources empty | `No sources yet. Connect Hacker News or a Substack RSS feed.` |
| Sources add HN | `Add Hacker News` |
| Sources add Substack | `Add Substack` |
| Sources HN exists | `Hacker News is already connected.` |
| Sources delete confirm | `Remove this source?` |
| Sources duplicate | `That source is already added.` |
| Sources invalid | `Check the RSS URL.` |
| Settings heading | `Settings` |
| Settings sign out | `Sign out` |
| Settings health | `System` |
| Unauth landing lede (keep/evolve) | `Focused stories for topics you care about.` |
| Sign-in lede (existing) | `Sign in with your email and password.` |

### Acceptance criteria

1. **Auth routing:** Signed-out users see brand landing on `/` with Sign up / Sign in; signed-in users see the feed on `/`. Protected routes redirect to sign-in.
2. **Feed list:** Authenticated `/` loads `listFeed` (default page size OK, e.g. 20) and renders story rows per spec (title link, reason, meta, actions) — **not** a card grid.
3. **Interactions:** Save / Dismiss / Seen (on title open) call existing status endpoints; UI updates without full page reload. Dismissed items leave the default Feed view.
4. **Filters:** Topic and source filters call `GET /api/feed` with query params; Saved view lists only saved items (thin `status` query — see contract).
5. **Pagination:** Load more uses `nextCursor` until null.
6. **Topics CRUD:** Full create/edit/toggle/delete against existing topics API; duplicate/validation errors show specified copy.
7. **Sources CRUD:** Add HN (singleton UX), add Substack RSS, toggle, delete against existing sources API; errors mapped as specified.
8. **Settings:** Shows email, sign-out works, health checks displayed without crashing if Ollama is down.
9. **api-client:** Browser calls go through `@newsroom/api-client` (or thin wrappers) with `credentials: "include"` — no ad-hoc `fetch` duplication of contract types.
10. **api task thin:** No new Postgres tables/migrations. Only optional feed `status` filter + any session layout/BFF glue. No Ollama calls from UI.
11. **Visual bar:** Masthead brand-first; atmospheric background retained/evolved; no purple glow theme; no dashboard card wall; mobile-usable.
12. **Verify:** `pnpm --filter @newsroom/web typecheck` (and `pnpm web:test` if touched); `pnpm build` or turbo build graph green; manual checklist in Implementation result.
13. **Docs:** README notes how to open feed UI after seed + ingest/rank; backlog status → ✅ via `docs` task / `record-feature-complete.sh`; architecture Clients note remains accurate (no contradictory API inventing).

## API / DB contract (if any)

PostgreSQL-backed; Better Auth for identity. **Domain schema already shipped** (`hybrid-rank-feed`, `ingest-hn-substack`). This feature primarily **consumes** existing HTTP APIs.

### Existing endpoints (consume as-is)

| Field / Endpoint | Type | Source | Notes |
|------------------|------|--------|-------|
| `POST /api/auth/*` | Better Auth | session cookies | Sign-up / sign-in / sign-out |
| `GET/POST /api/topics` | JSON | `topics` | Session-scoped list/create |
| `PATCH/DELETE /api/topics/:id` | JSON / 204 | `topics` | Update / delete own |
| `GET/POST /api/sources` | JSON | `source_subscriptions` | List/create HN \| Substack |
| `PATCH/DELETE /api/sources/:id` | JSON / 204 | `source_subscriptions` | Enable/config / delete |
| `GET /api/feed?cursor=&topic=&source=&limit=` | `FeedPage` | `user_article_scores` ⨝ articles | Default excludes `dismissed` |
| `POST /api/feed/:articleId/seen\|saved\|dismissed` | `{ item }` | score status | `404` if no score row |
| `GET /api/health` | JSON | probes | Unauthenticated; Settings display |

**`FeedItem` / `Topic` / `Source` shapes:** as in `packages/api-client` (camelCase JSON). Do not rename fields in UI-only DTOs.

### Thin API gap (allowed in `api` task)

| Field / Endpoint | Type | Source | Notes |
|------------------|------|--------|-------|
| `GET /api/feed?status=` | optional query | scores | **Add** optional `status=saved` (and optionally `seen` \| `new`). When `status` omitted → current behavior (exclude `dismissed`). When `status=saved` → only that status (still session-scoped). Invalid value → `400` `{ "error": "invalid_filter" }`. Wire through `ListFeedOptions.status` in `packages/api-client`. |
| Auth layout / RSC session helpers | N/A | Better Auth | Not a new public API — shared layout loading session for chrome + guards. |

**Explicitly not required:** new tables, new ranking endpoints, admin triggers, password-change API, feed search, infinite SSR of all articles, Bluesky.

### DB

| Concern | Notes |
|---------|-------|
| Migrations | **None** expected |
| Seed | No change required; UI must work with existing `pnpm db:seed` demo user + topic + HN + Platformer |

## Touchpoints

- `apps/web/src/app/` — replace placeholder home; add `topics`, `sources`, `settings` routes; shared authenticated layout/chrome
- `apps/web/src/app/globals.css` (+ optional component CSS modules) — editorial feed styles; evolve tokens
- `apps/web/src/lib/` — client helpers wrapping `ApiClient`, auth redirect helpers
- `apps/web/src/app/api/feed/route.ts` + `packages/api-client` — only if implementing `status` filter
- `apps/web` tests — extend only if parsers/helpers added for feed status query
- `README.md` — how to exercise UI after seed/ingest/rank
- Must not contradict `docs/architecture.md` (Clients: calm editorial UI)

## Out of scope

- Expo / mobile UI (`mobile-feed-topics`)
- New ingest/rank worker behavior or Ollama-from-browser
- Bluesky / X source types in UI
- Multi-user admin, rate limits, OAuth (`multiuser-harden`)
- Password reset / profile editing / avatars
- Full-text paywalled Substack bodies / in-app article reader (open canonical URL only)
- Push notifications, keyboard shortcuts, PWA install
- Redesigning Better Auth email/password contracts
- Showing raw rank scores or AI debug panels
- Closing or inventing GitHub parent/task issue numbers while Issues API is 403

## Open questions / non-blocking defaults

| Topic | Default for implementer |
|-------|-------------------------|
| Saved filter API | Implement `?status=saved` thin glue in `api` task; do not client-only filter across pages |
| “Remove from saved” | `POST .../seen` (leaves Saved view); do not add PATCH status enum endpoint |
| Unauth `/` | Keep brand + lede + Sign up / Sign in; no marketing sections below |
| HN add when missing | Default `config: {}` or `{ mode: "top" }` — match sources API defaults |
| Keywords input | Comma-separated string split/trim on submit |
| Scores in UI | Hidden in v1 |
| Middleware vs layout | Prefer Next.js layout + `auth.api.getSession` redirects; `middleware.ts` optional |

---

## Implementation result

### Changes

- **api:** Optional `GET /api/feed?status=` (`new`\|`seen`\|`saved`\|`dismissed`); invalid → `400 invalid_filter`. `parseFeedStatusFilter` + unit tests. `ListFeedOptions.status` in `@newsroom/api-client`.
- **web:** Brand landing (signed-out `/`); authenticated `AppShell` masthead (Newsroom + Feed/Topics/Sources/Settings + sign-out). Feed client with filters, story rows, Save/Dismiss/seen-on-title, pagination. Topics/Sources CRUD pages; Settings email + health. Session guards via `requirePageSession` + `callbackUrl` on sign-in. Browser calls via `getBrowserApiClient()` (`credentials: "include"`). Evolved `globals.css` (editorial rows, masthead/row/landing motion).
- **docs:** README feed UI walkthrough; architecture feed `status=` note; backlog ✅ via `record-feature-complete.sh`.

### Verification

- [x] `pnpm --filter @newsroom/web typecheck` — pass
- [x] `pnpm --filter @newsroom/web exec tsx --test --test-force-exit src/lib/feed.test.ts src/lib/topics.test.ts` — pass (status parser included)
- [x] `DATABASE_URL=… BETTER_AUTH_*=… pnpm --filter @newsroom/web build` — pass (routes `/`, `/topics`, `/sources`, `/settings`)
- [x] `pnpm --filter @newsroom/api-client typecheck` — pass
- [ ] Manual (needs Postgres + seed + ingest/rank): sign-in → feed rows, topic/source/Saved filters, Topics/Sources CRUD, Settings health with Ollama down
- Note: bare `pnpm build` (turbo) fails without `DATABASE_URL` at Next page-data collect — pre-existing env requirement, not introduced here. Isolation tests in `web:test` need live Postgres.

### Deviations from spec

- None material. Empty feed supporting copy includes the seed/ingest/rank hint from the empty-state table (in addition to the short Copy-table body).
- GitHub Issues status/`gh issue close` skipped due to 403; progress tracked only in this handoff.

### Follow-ups

- Close/reopen GitHub task issues when Issues token works.
- Manual browser checklist above against seeded demo user.
- Expo `mobile-feed-topics` remains backlog next for mobile surfaces.

---

## Handoff summary (for developer agent)

- **Ship polished web UI only:** authenticated Feed + Topics + Sources + Settings; calm editorial reading list (no card-wall dashboard); reuse existing session APIs via `packages/api-client`.
- **Routes:** `/` feed (signed-in) / brand landing (signed-out); `/topics`, `/sources`, `/settings`; protect with sign-in redirect; evolve Fraunces/Source Sans + atmospheric CSS.
- **Feed behavior:** story rows with title→external URL + seen, reason, Save/Dismiss, topic/source filters, Load more; Saved view needs thin `GET /api/feed?status=saved` (+ api-client) — **no new DB tables**.
- **Topics/Sources:** full CRUD UX against existing endpoints; singleton HN messaging; map `duplicate` / validation errors to specified copy.
- **Pipeline next:** `api` (thin) → `web` → `verify` → `docs`; GitHub task issue close/reopen blocked (403) until Issues token works — track by slug in this handoff.
