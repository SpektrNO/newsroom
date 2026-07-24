# Handoff: ingest-hn-substack

**Status:** spec  
**Created:** 2026-07-24  
**Specifier agent:** spec complete  
**Developer agent:** pending

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `ingest-hn-substack` |
| Parent issue | #12 — https://github.com/SpektrNO/newsroom/issues/12 |
| Open tasks | `db` (#14), `api` (#15), `worker` (#16), `verify` (#17), `docs` (#18) |

Task order: `audit` → `spec` → `db` → `api` → `worker` → `web` → `mobile` → `verify` → `docs`  
(This feature has no `web` / `mobile` tasks — skip those slugs.)

Closed Phase 1: `spec` (#13).

## Intent

Authenticated users can manage HN and Substack source subscriptions; a worker (schedule or CLI) fetches recent items via adapters and upserts shared `articles` linked through `article_sources`.

## User-facing spec

| Field | Value |
|-------|-------|
| Trigger | User creates/toggles/deletes source subscriptions via API; worker runs ingest on ~10–15 min schedule or one-shot CLI. |
| Surfaces | `packages/sources` adapters · `packages/db` schema · Next.js `/api/sources*` · `apps/worker` ingest job · optional seed/CLI — **no feed UI** |
| Copy | N/A (no product UI in this feature). API error messages: plain JSON `{ "error": "<code>" }` (see contract). |
| Acceptance | See **Acceptance criteria** below. |

### Acceptance criteria

1. **Adapters:** `HackerNewsAdapter` and `SubstackAdapter` implement `SourceAdapter` (`fetchRecent() → NormalizedArticle[]`) in `packages/sources`. Stub may remain for tests; live adapters perform network I/O.
2. **HN:** Fetches recent/top items via Firebase HN API and/or Algolia HN Search (architecture allows both). Returns normalized URL, title, optional summary/author/`publishedAt`, and `raw` payload. Limits a single `fetchRecent` call to a bounded batch (e.g. ≤100 items) — document the chosen limit.
3. **Substack:** Given `config.rssUrl`, fetches and parses RSS/Atom; maps items to `NormalizedArticle`. Does **not** scrape paywalled full bodies.
4. **Upsert:** Ingest writes `articles` keyed by **canonical URL** (unique). Re-fetch updates title/summary/author/`published_at`/`raw`/`content_hash` when changed; does not create duplicates for the same URL.
5. **Linkage:** Each successful ingest path creates/updates `article_sources` tying the article to `source_type` and the originating `source_subscription_id`.
6. **Subscriptions:** `source_subscriptions` rows are **per-user** (`user_id`). HN: at most one subscription per user (`source_type = hackernews`). Substack: many per user, unique on `(user_id, rssUrl)` (normalize URL before uniqueness check).
7. **API:** Session-authenticated `GET/POST/PATCH/DELETE /api/sources` manage only the caller’s subscriptions. Unauthenticated → `401`. Cross-user access → not possible (filter by session `user_id`).
8. **Worker:** Can (a) process an `ingest` job from the Postgres `jobs` queue on an interval (~10–15 min), and (b) run a one-shot ingest via CLI/script (documented in README). One ingest pass processes all **enabled** subscriptions across users (shared article store).
9. **Jobs:** Minimal Postgres-backed queue supports at least `type = ingest`. Do not implement ranking jobs or call Ollama.
10. **Seed:** Local seed (script or documented migration seed) can create/ensure: one demo user path **or** attach to an existing Better Auth user — enable HN + one example Substack RSS URL. Topics seed is **out of scope**.
11. **Verify:** Automated checks cover adapter normalization (fixture/mocked HTTP) and an ingest path that leaves ≥1 `articles` + matching `article_sources` row for a seeded/test subscription (mock or recorded fixture preferred over flaky live HN in CI).
12. **Docs:** README lists migrate, seed (if any), worker start/schedule, and one-shot ingest commands.

## API / DB contract

PostgreSQL-backed; Better Auth session for identity. Extend existing Better Auth `user` / `session` tables — do not duplicate users.

### Tables (new)

#### `source_subscriptions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | UUID or nanoid |
| `user_id` | text FK → `user.id` ON DELETE CASCADE | Required |
| `source_type` | text not null | `hackernews` \| `substack` (reserve `bluesky` in app enum/types; no Bluesky adapter yet) |
| `config` | jsonb not null default `{}` | See config shapes below |
| `enabled` | boolean not null default true | |
| `created_at` | timestamptz not null | |
| `updated_at` | timestamptz not null | |

**Constraints**

- Partial unique: one `hackernews` row per `user_id`.
- Unique `(user_id, (config->>'rssUrl'))` for `source_type = substack` (or equivalent unique index after URL normalization in app code + DB check).
- Index on `(user_id)`, `(enabled, source_type)`.

**`config` shapes**

| `source_type` | Config | Required keys |
|---------------|--------|----------------|
| `hackernews` | `{}` or `{ "mode": "top" \| "new" }` | None; default mode `top` if omitted |
| `substack` | `{ "rssUrl": "https://..." }` | `rssUrl` — absolute http(s) URL |

Reject unknown keys only if they break parsing; ignore extra keys safely.

#### `articles`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `canonical_url` | text not null UNIQUE | Normalized absolute URL (strip fragment; consistent trailing-slash policy — document choice) |
| `title` | text not null | |
| `summary` | text null | |
| `author` | text null | |
| `published_at` | timestamptz null | |
| `raw` | jsonb null | Adapter payload snapshot |
| `content_hash` | text null | Hash of stable fields for change detection |
| `created_at` | timestamptz not null | |
| `updated_at` | timestamptz not null | |

#### `article_sources`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `article_id` | text FK → `articles.id` ON DELETE CASCADE | |
| `source_subscription_id` | text FK → `source_subscriptions.id` ON DELETE SET NULL | Nullable if subscription deleted later |
| `source_type` | text not null | Denormalized mirror of adapter type |
| `external_id` | text null | e.g. HN item id |
| `fetched_at` | timestamptz not null | Last successful fetch via this link |

**Constraints:** unique `(article_id, source_subscription_id)` when `source_subscription_id` is not null; else unique `(article_id, source_type)` for orphaned rows. Index on `source_subscription_id`.

#### `jobs`

Minimal Postgres queue (architecture default; no Redis).

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | |
| `type` | text not null | This feature: `ingest` only. Allow `rank` in check/enum for later — **do not enqueue or process `rank`**. |
| `status` | text not null | `pending` \| `running` \| `completed` \| `failed` |
| `payload` | jsonb not null default `{}` | Optional filters later; empty OK for full ingest |
| `scheduled_at` | timestamptz not null | When eligible to run |
| `started_at` | timestamptz null | |
| `finished_at` | timestamptz null | |
| `attempts` | int not null default 0 | |
| `last_error` | text null | |
| `created_at` | timestamptz not null | |

Index: `(status, scheduled_at)` for claim queries. Worker claims with row lock / `UPDATE … WHERE status = 'pending' … RETURNING` pattern (or equivalent) to stay multi-worker-safe.

### Tables explicitly **not** in this feature

- `topics`
- `user_article_scores`
- Any feed-ranking columns

### `NormalizedArticle` / adapter contract

Existing stub in `packages/sources` is the baseline. Implementers may extend the type **only** if needed for ingest (e.g. optional `externalId?: string`); keep `fetchRecent(): Promise<NormalizedArticle[]>`.

| Field | Required | Maps to |
|-------|----------|---------|
| `url` | yes | `articles.canonical_url` (after normalization) |
| `title` | yes | `articles.title` |
| `summary` | no | `articles.summary` |
| `author` | no | `articles.author` |
| `publishedAt` | no | `articles.published_at` |
| `raw` | no | `articles.raw` |
| `contentHash` | no | `articles.content_hash` (worker may compute if adapter omits) |

Constructor/factory: adapters receive subscription `config` (and optionally `source_type`).

### HTTP API

Base: Next.js App Router under `apps/web`. All routes below require Better Auth session.

| Endpoint | Method | Body / query | Success | Errors |
|----------|--------|--------------|---------|--------|
| `/api/sources` | `GET` | — | `200` `{ "sources": Source[] }` | `401` |
| `/api/sources` | `POST` | Create body (below) | `201` `{ "source": Source }` | `401`, `400` validation, `409` duplicate HN or Substack URL |
| `/api/sources/:id` | `PATCH` | `{ "enabled"?: boolean, "config"?: object }` | `200` `{ "source": Source }` | `401`, `404` (wrong id / other user), `400` |
| `/api/sources/:id` | `DELETE` | — | `204` empty | `401`, `404` |

**`Source` JSON shape**

```json
{
  "id": "…",
  "sourceType": "hackernews" | "substack",
  "config": {},
  "enabled": true,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

**`POST /api/sources` body**

```json
{ "sourceType": "hackernews", "config": { "mode": "top" }, "enabled": true }
```
or
```json
{ "sourceType": "substack", "config": { "rssUrl": "https://example.substack.com/feed" }, "enabled": true }
```

- Default `enabled: true` if omitted.
- `bluesky` (and other non-v1 types) → `400` `{ "error": "unsupported_source_type" }`.
- Invalid/missing `rssUrl` for Substack → `400` `{ "error": "invalid_config" }`.

**Not in this feature:** `GET /api/feed`, topic routes, seen/saved/dismissed, health changes (keep existing health as-is unless DB check already covers new tables implicitly).

### `packages/api-client`

Add typed helpers mirroring the sources API (session cookie / `fetch` injection same as future authenticated calls). Health client stays unchanged.

### Worker / CLI behavior

| Mode | Behavior |
|------|----------|
| Scheduled | Worker loop: ensure a pending `ingest` job exists on ~10–15 min cadence **or** claim due jobs continuously; process `ingest` by loading enabled `source_subscriptions`, calling adapters, upserting articles + `article_sources`. |
| One-shot | Documented command (e.g. `pnpm --filter @newsroom/worker ingest` or `NEWSROOM_WORKER_ONCE=ingest`) enqueues+runs or runs ingest inline, then exits `0` on success. |
| Idle | Existing `NEWSROOM_WORKER_IDLE=1` may remain for long-running process that also polls jobs. |

**Ingest algorithm (normative)**

1. Load all `source_subscriptions` where `enabled = true` (all users).
2. For each subscription, instantiate the matching adapter with `config`; call `fetchRecent()`.
3. For each `NormalizedArticle`: normalize URL → upsert `articles` on `canonical_url` → upsert `article_sources` for this subscription.
4. Adapter/network failures for one subscription: log, record on job `last_error` (aggregate OK), continue other subscriptions; job may still `completed` with partial success unless **all** subscriptions fail → then `failed`.
5. Never write `user_article_scores` or call `packages/ai`.

### Seed / config path

Prefer a **documented seed script** (Make/`pnpm` target) that:

1. Requires an existing user id **or** creates a single local seed user via Better Auth APIs / direct insert consistent with auth schema.
2. Upserts HN subscription (`enabled: true`).
3. Upserts one example Substack `rssUrl` (use a stable public feed; document which).

Pure env-only config **without** `source_subscriptions` rows is **rejected** — architecture stores config on subscriptions.

## Touchpoints

- `packages/db` — Drizzle schema + migration for `source_subscriptions`, `articles`, `article_sources`, `jobs`
- `packages/sources` — `HackerNewsAdapter`, `SubstackAdapter`; keep exported types; RSS parser + HN HTTP client deps live here or worker-only if cleaner (prefer adapters self-contained in `packages/sources`)
- `packages/api-client` — sources methods
- `apps/web` — `/api/sources` route handlers + session auth
- `apps/worker` — job claim loop + ingest runner + CLI one-shot
- `README.md` / `docs/ops-local.md` — commands for migrate, seed, worker, one-shot ingest
- Must not contradict `docs/architecture.md`

## Out of scope

- Topics CRUD and `topics` table
- Keyword shortlist, Ollama ranking, `user_article_scores`
- `GET /api/feed` and feed interaction endpoints
- Web/mobile sources or feed UI (`web-feed-topics-sources`, `mobile-feed-topics`)
- Bluesky / X adapters
- Full-text paywalled Substack bodies
- Redis or non-Postgres queues
- Changing Better Auth providers / OAuth
- Ranking job processing (`type = rank` may exist in enum only)

## Open questions / non-blocking defaults

| Topic | Default for implementer |
|-------|-------------------------|
| HN exact endpoint mix | Use Firebase for item hydration; use Algolia HN Search **or** Firebase `topstories`/`newstories` lists for candidate IDs. Document choice in code comment + README. Prefer determinism for tests via mocked HTTP. |
| Canonical URL normalization | Lowercase host; strip `#fragment`; preserve path; choose one trailing-slash policy and apply everywhere. |
| Job scheduler | Worker self-enqueues next `ingest` after completion **or** inserts due job every interval — either OK if ~10–15 min and single-flight (no duplicate concurrent ingest jobs). |

---

## Implementation result

*(Developer agent fills this section.)*

### Changes

- 

### Verification

- [ ] How tested
- [ ] What remains manual

### Deviations from spec

- None / list with rationale

### Follow-ups

- 

---

## Handoff summary (for developer agent)

- **Ship ingest only:** HN + Substack adapters, upsert `articles` by canonical URL, `article_sources` + per-user `source_subscriptions`, Postgres `jobs` queue with `ingest` processing — no topics, scores, ranking, or feed API/UI.
- **API:** Session-scoped `GET/POST/PATCH/DELETE /api/sources` with HN singleton-per-user and Substack RSS URL uniqueness; wire `packages/api-client`.
- **Worker:** ~10–15 min scheduled ingest via `jobs` **and** documented one-shot CLI; process all enabled subscriptions; partial failure tolerant per subscription.
- **DB:** Add four tables (`source_subscriptions`, `articles`, `article_sources`, `jobs`); leave `topics` / `user_article_scores` for `hybrid-rank-feed`.
- **Verify + docs:** Fixture-based adapter/ingest tests; README commands for migrate, seed (HN + one Substack), worker, and one-shot ingest.
