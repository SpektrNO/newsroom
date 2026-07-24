# Handoff: hybrid-rank-feed

**Status:** done  
**Created:** 2026-07-24  
**Specifier agent:** spec complete  
**Developer agent:** complete

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `hybrid-rank-feed` |
| Parent issue | #19 — https://github.com/SpektrNO/newsroom/issues/19 |
| Open tasks | _(none)_ |
| Closed tasks | `spec` (#20), `db` (#21), `api` (#22), `worker` (#23), `verify` (#24), `docs` (#25) |

Task order: `audit` → `spec` → `db` → `api` → `worker` → `web` → `mobile` → `verify` → `docs`  
(This feature has no `web` / `mobile` tasks — skip those slugs.)

Closed Phase 1: `spec` (#20).

## Intent

Authenticated users manage topic keywords, and a worker keyword-shortlists then Ollama-ranks ingested articles into a cursor-paginated personal feed API with seen/saved/dismissed actions.

## User-facing spec

| Field | Value |
|-------|-------|
| Trigger | User creates/updates topics via API; worker ranks after ingest (or via one-shot rank CLI); clients read `GET /api/feed` and post interaction status. |
| Surfaces | `packages/db` · `packages/ai` ranking helpers · Next.js `/api/topics*`, `/api/feed*` · `apps/worker` rank job · `packages/api-client` — **no polished web/mobile UI** |
| Copy | N/A (no product UI in this feature). API errors: plain JSON `{ "error": "<code>" }` (same pattern as sources). |
| Acceptance | See **Acceptance criteria** below. |

### Acceptance criteria

1. **Topics:** `topics` rows are **per-user** (`user_id`) with `name`, `keywords[]`, `weight`, `enabled`. Session-authenticated CRUD only touches the caller’s topics.
2. **Scores:** `user_article_scores` stores per `(user_id, article_id)`: `keyword_score`, `ai_score`, `final_rank`, `reason`, `status` (`new` \| `seen` \| `saved` \| `dismissed`), plus timestamps.
3. **Keyword pass:** For each user with ≥1 enabled topic, match article `title` + `summary` against enabled topic keywords (case-insensitive substring or token match — document choice). Clear misses are **not** written as feed rows (no score row, or only ephemeral shortlist — prefer **no row** until keyword hit). Hits get a `keyword_score` in `[0, 1]` reflecting match strength (weight-aware; document formula).
4. **AI pass:** Shortlisted articles are ranked via `packages/ai` (Ollama behind `AiProvider`). Never call Ollama from UI packages. Batches of **~20–50** articles per model call (configurable; default 30). Each item returns: relevance `ai_score` in `[0, 1]`, optional near-duplicate hint (article id or canonical URL of peer in batch / prior scores), and a one-line `reason`. Persist scores; set `final_rank` from keyword + AI (document formula, e.g. weighted sum).
5. **Near-dup:** Near-duplicate hints must not crash the pipeline if parse fails; store hint when present (nullable column or JSON field — see contract). Prefer marking lower-ranked dups without deleting articles.
6. **Worker:** Supports `jobs.type = rank` (in addition to existing `ingest`). After a successful ingest job (or at end of one-shot ingest), enqueue a `rank` job if none pending. Also support one-shot rank CLI (`pnpm worker:rank` / `NEWSROOM_WORKER_ONCE=rank`). Long-running worker claims both `ingest` and `rank`.
7. **Rank scope:** One rank pass processes users who have enabled topics; for each user, shortlist recent unmatched / stale articles (document window, e.g. articles ingested or updated in last 7 days, or never scored), keyword-filter, then AI-rank in batches. Partial Ollama failure: mark job `failed` or `completed` with `last_error` aggregate — prefer continue other users; if Ollama unreachable for all batches → `failed`.
8. **Feed API:** `GET /api/feed` returns the session user’s scored articles ordered by `final_rank` desc (tie-break `article_id`), cursor pagination, optional `topic` and `source` filters. Default excludes `dismissed`.
9. **Interactions:** `POST /api/feed/:id/seen|saved|dismissed` updates `user_article_scores.status` for that article. Unknown / other-user article score → `404`. Unauthenticated → `401`.
10. **Topics API:** `GET/POST /api/topics`, `PATCH/DELETE /api/topics/:id` — session-scoped; validation errors → `400`.
11. **api-client:** Typed helpers for topics CRUD, feed list, and feed status posts (same cookie/`fetch` injection pattern as sources).
12. **Seed:** Extend `pnpm db:seed` with ≥1 example enabled topic (keywords that can match HN/Substack titles) for the demo user. Do not remove existing HN/Substack seed behavior.
13. **Verify:** Automated tests cover (a) keyword matching / score formula with fixtures, (b) AI ranking parse with mocked `AiProvider` (no live Ollama in unit/CI), (c) feed/topics API auth isolation (session user only), (d) worker rank path writing ≥1 `user_article_scores` row given fixture articles + topics. Live Ollama remains optional smoke (`packages/ai` smoke already exists).
14. **Docs:** README lists migrate, seed (topics), worker rank / one-shot rank, and feed/topics API overview pointers.

## API / DB contract

PostgreSQL-backed; Better Auth session for identity. Extend existing ingest tables — do not change canonical URL / sources contracts from `ingest-hn-substack`.

### Tables (new)

#### `topics`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | UUID |
| `user_id` | text FK → `user.id` ON DELETE CASCADE | Required |
| `name` | text not null | Display name; trim; non-empty |
| `keywords` | jsonb not null | JSON string array, e.g. `["llm","postgres"]`; ≥1 keyword on create when `enabled` |
| `weight` | real/double not null default `1` | Relative importance; clamp to sensible range (e.g. `0.1`–`10`) in API |
| `enabled` | boolean not null default true | Disabled topics excluded from keyword/AI ranking |
| `created_at` | timestamptz not null | |
| `updated_at` | timestamptz not null | |

**Constraints**

- Index on `(user_id)`, `(user_id, enabled)`.
- Optional unique `(user_id, lower(name))` — **yes**, enforce case-insensitive unique name per user → `409` on conflict.

#### `user_article_scores`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | UUID |
| `user_id` | text FK → `user.id` ON DELETE CASCADE | |
| `article_id` | text FK → `articles.id` ON DELETE CASCADE | |
| `keyword_score` | real not null | `[0, 1]` |
| `ai_score` | real null | `[0, 1]`; null until AI pass completes |
| `final_rank` | real not null | Sort key; update when AI completes |
| `reason` | text null | One-line why from AI (or keyword-only reason before AI) |
| `near_duplicate_of_article_id` | text null FK → `articles.id` ON DELETE SET NULL | Optional near-dup peer |
| `status` | text not null default `new` | `new` \| `seen` \| `saved` \| `dismissed` |
| `scored_at` | timestamptz not null | Last keyword/AI write |
| `created_at` | timestamptz not null | |
| `updated_at` | timestamptz not null | |

**Constraints**

- Unique `(user_id, article_id)`.
- Index `(user_id, final_rank desc)` (or equivalent) for feed.
- Index `(user_id, status)`.
- Check / app enum for `status`.

### Jobs (`jobs` table — extend usage)

Existing `jobs` table stays. This feature **processes** `type = rank`.

| `type` | Payload | Behavior |
|--------|---------|----------|
| `ingest` | `{}` (unchanged) | After successful ingest completion, enqueue `rank` if no open (`pending`/`running`) rank job exists |
| `rank` | `{}` or `{ "userId"?: string }` | Rank all eligible users, or single user if `userId` set |

Worker claim: claim next due job among `ingest` **and** `rank` (prefer earliest `scheduled_at`). Avoid concurrent duplicate rank jobs (single-flight same as ingest).

### Ranking algorithm (normative)

1. **Eligible users:** those with ≥1 `topics` where `enabled = true`.
2. **Candidate articles:** articles linked via `article_sources` to that user’s enabled `source_subscriptions` (personal Substack + shared HN via their HN subscription). Include articles not yet in `user_article_scores` for that user, **or** with `ai_score` null / `scored_at` older than article `updated_at` (re-score when article content changes). Cap candidates per user per run (e.g. 200) ordered by `published_at`/`created_at` desc.
3. **Keyword shortlist:** For each candidate, compute match against all enabled topics’ keywords. If no keyword hits → skip (no row). If hit → upsert score with `keyword_score`, provisional `final_rank = keyword_score` (or weight-normalized), `reason` optional keyword summary, `ai_score` null if first write.
4. **AI batches:** Take shortlist needing AI (e.g. `ai_score` is null), chunk size default **30** (env `RANK_BATCH_SIZE`, clamp 20–50). Call ranking helper in `packages/ai` with topic names/keywords + article title/summary (truncate summaries). Parse structured JSON array; on malformed item, keep keyword-only score and continue.
5. **Persist AI:** Set `ai_score`, `reason`, optional `near_duplicate_of_article_id`, `final_rank = combine(keyword_score, ai_score, topic weights)` — document exact formula in code + README (suggested default: `0.35 * keyword_score + 0.65 * ai_score`, then mildly boost by max matched topic `weight` capped).
6. **Idempotency:** Re-running rank upserts the same `(user_id, article_id)`; do **not** reset `status` on re-score unless status was never set.

### `packages/ai` ranking surface

Keep `AiProvider.complete` / `health`. Add a **ranking helper** (e.g. `rankArticleBatch(provider, input) → RankedItem[]`) that:

- Builds a strict JSON-only prompt
- Parses model output into `{ articleId, aiScore, reason, nearDuplicateOfArticleId? }[]`
- Does not import DB or Next.js

Optional: extend `AiProvider` with `rank` only if it stays provider-portable; otherwise helper-on-`complete` is preferred (minimal surface).

### HTTP API

Base: Next.js App Router under `apps/web`. Session required unless noted.

#### Topics

| Endpoint | Method | Body / query | Success | Errors |
|----------|--------|--------------|---------|--------|
| `/api/topics` | `GET` | — | `200` `{ "topics": Topic[] }` | `401` |
| `/api/topics` | `POST` | Create body | `201` `{ "topic": Topic }` | `401`, `400`, `409` duplicate name |
| `/api/topics/:id` | `PATCH` | Partial update | `200` `{ "topic": Topic }` | `401`, `404`, `400`, `409` |
| `/api/topics/:id` | `DELETE` | — | `204` | `401`, `404` |

**`Topic` JSON**

```json
{
  "id": "…",
  "name": "AI infra",
  "keywords": ["llm", "ollama", "postgres"],
  "weight": 1,
  "enabled": true,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

**`POST /api/topics` body**

```json
{
  "name": "AI infra",
  "keywords": ["llm", "ollama"],
  "weight": 1,
  "enabled": true
}
```

- Default `weight: 1`, `enabled: true`.
- Empty `name` or empty `keywords` array → `400` `{ "error": "invalid_topic" }`.
- Keywords: non-empty strings, trim, drop empties; max e.g. 50 keywords / 64 chars each (document limits).

**`PATCH`:** any of `name`, `keywords`, `weight`, `enabled`.

#### Feed

| Endpoint | Method | Body / query | Success | Errors |
|----------|--------|--------------|---------|--------|
| `/api/feed` | `GET` | `cursor?`, `topic?` (topic id), `source?` (`hackernews` \| `substack`), `limit?` (default 20, max 50) | `200` FeedPage | `401`, `400` bad cursor/filter |
| `/api/feed/:articleId/seen` | `POST` | — | `200` `{ "item": FeedItem }` | `401`, `404` |
| `/api/feed/:articleId/saved` | `POST` | — | `200` `{ "item": FeedItem }` | `401`, `404` |
| `/api/feed/:articleId/dismissed` | `POST` | — | `200` `{ "item": FeedItem }` | `401`, `404` |

**Default feed filter:** `status != 'dismissed'`. Optional query `status=` later is out of scope unless cheap; do not require it.

**`topic` filter:** article must have matched that topic in the latest score path **or** simpler: filter scores whose keyword match set included that topic — if too heavy, accept filter as “user owns topic id” AND article keywords overlap that topic’s keywords at query time (recompute overlap for filter only). Prefer storing nothing extra; re-check keyword overlap for `topic=` filter is OK.

**`source` filter:** article has ≥1 `article_sources.source_type` equal to filter (and preferably linked to the user’s subscription for that type).

**`FeedItem` JSON**

```json
{
  "articleId": "…",
  "title": "…",
  "summary": "…",
  "canonicalUrl": "https://…",
  "author": "…",
  "publishedAt": "ISO-8601|null",
  "sources": [{ "sourceType": "hackernews", "externalId": "123" }],
  "keywordScore": 0.8,
  "aiScore": 0.72,
  "finalRank": 0.75,
  "reason": "Matches your LLM topic; discusses local inference.",
  "nearDuplicateOfArticleId": null,
  "status": "new",
  "scoredAt": "ISO-8601"
}
```

**`FeedPage`**

```json
{
  "items": [ "FeedItem" ],
  "nextCursor": "opaque-string-or-null"
}
```

Cursor: opaque (e.g. base64 of `{ finalRank, articleId }`); stable ordering `final_rank DESC, article_id DESC`.

Architecture lists `POST /api/feed/:id/seen|saved|dismissed` — use **`articleId`** as `:id` (score is looked up by session user + article). Creating a status update for an article with **no** score row → `404` `{ "error": "not_found" }` (do not invent scores from interactions alone in v1).

### `packages/api-client`

Add:

- `listTopics`, `createTopic`, `patchTopic`, `deleteTopic`
- `listFeed({ cursor?, topic?, source?, limit? })`
- `markFeedSeen(articleId)`, `markFeedSaved(articleId)`, `markFeedDismissed(articleId)`

Mirror existing `ApiError` / credentials pattern.

### Worker / CLI behavior

| Mode | Behavior |
|------|----------|
| After ingest | On ingest job `completed` (including partial subscription success), `ensureNextRankJob` (pending immediately if none open) |
| Scheduled / poll | Existing poll loop also claims `rank` jobs; process via `processRankJob` |
| One-shot rank | `pnpm worker:rank` or `NEWSROOM_WORKER_ONCE=rank` enqueues+runs or runs inline, exit `0` on success |
| One-shot ingest | Unchanged, but should enqueue rank after (so local `pnpm worker:ingest` eventually needs a rank pass — either chain in-process or leave pending job for poller; **prefer enqueue pending rank** and document that `pnpm worker:rank` or the long-running worker finishes ranking) |

**Do not** call ranking from Next.js request handlers except optionally a future admin trigger (out of scope). Feed/topics routes only read/write DB.

### Seed

Extend `packages/db` seed:

1. Keep demo user + HN + Platformer Substack.
2. Upsert ≥1 topic, e.g. name `AI & infra`, keywords `["ai","llm","openai","postgres","typescript"]`, `weight: 1`, `enabled: true`.

### Health

Keep existing `/api/health` (DB + Ollama). No required change unless rank adds a new dependency (it should not).

## Touchpoints

- `packages/db` — schema + migration for `topics`, `user_article_scores`; seed topics
- `packages/ai` — batch ranking helper (+ unit tests with fake provider)
- `packages/api-client` — topics + feed methods
- `apps/web` — `/api/topics`, `/api/topics/[id]`, `/api/feed`, `/api/feed/[id]/seen|saved|dismissed`
- `apps/worker` — claim/process `rank`; enqueue after ingest; `worker:rank` script / env
- `README.md` / `docs/ops-local.md` — rank commands, seed topics note
- Must not contradict `docs/architecture.md`

## Out of scope

- Polished web feed / topics UI (`web-feed-topics-sources`)
- Expo feed / topics UI (`mobile-feed-topics`)
- Bluesky / X adapters and subscriptions
- Push notifications
- Calling Ollama from web or mobile bundles
- Redis or non-Postgres queues
- Multi-user rate limits / hosted AI swap (`multiuser-harden`)
- Full-text paywalled Substack bodies
- Changing Better Auth providers / OAuth
- Replacing or redesigning ingest adapters

## Open questions / non-blocking defaults

| Topic | Default for implementer |
|-------|-------------------------|
| Keyword match | Case-insensitive substring on `title` + `summary` (null summary = title only); score = min(1, sum over hits of topic.weight * 0.25) normalized into `[0,1]` — adjust if ugly but keep deterministic tests |
| `final_rank` | `0.35 * keyword_score + 0.65 * (ai_score ?? keyword_score)` |
| Rank after ingest | Enqueue `rank` pending; do not block ingest response/job finish on Ollama |
| Near-dup storage | `near_duplicate_of_article_id` column; ignore invalid ids from model |
| Feed without scores | Empty `items` until rank runs — acceptable |
| Architecture `GET/POST/PATCH /api/topics` | This handoff adds **DELETE** for full CRUD (aligned with sources) |

---

## Implementation result

### Changes

- **db:** `topics` + `user_article_scores` schema/migration `0002`; seed topic `AI & infra`.
- **api:** Session-scoped `/api/topics` CRUD, `/api/feed` cursor pagination + filters, status posts; `packages/api-client` helpers; `packages/ai` `scoreKeywordMatch` / `combineFinalRank` / `rankArticleBatch`.
- **worker:** `jobs.type=rank` claim/process; enqueue after ingest; `pnpm worker:rank` / `NEWSROOM_WORKER_ONCE=rank`; poller claims ingest+rank.
- **verify:** Keyword + AI parse unit tests; worker rank integration (mocked AI); topics/feed session isolation tests.
- **docs:** README + ops-local rank/seed/API notes; ADR `docs/decisions/002-hybrid-ranking.md`; architecture DELETE topics.

### Verification

- [x] `pnpm --filter @newsroom/ai test` (keyword formula + rank JSON parse)
- [x] `pnpm worker:test` (ingest + rank → ≥1 score row; Postgres)
- [x] `pnpm web:test` (parsers + session isolation; Postgres)
- [x] `pnpm --filter @newsroom/web typecheck`
- [ ] Live Ollama end-to-end rank smoke (`pnpm worker:rank` with Ollama up) — optional
- [ ] Manual HTTP topics/feed with browser session cookie

### Deviations from spec

- None material. Near-dup peers accepted only within the current AI batch ids (invalid/out-of-batch ids ignored). Mild topic-weight boost on `final_rank` omitted; used exact open-question formula `0.35/0.65`.

### Follow-ups

- Polished web/mobile UI (`web-feed-topics-sources`, `mobile-feed-topics`)
- Optional live Ollama CI smoke for rank batches

---

## Handoff summary (for developer agent)

- **Ship ranking + feed APIs only:** `topics` CRUD, `user_article_scores`, keyword shortlist → Ollama batch rank via `packages/ai`, worker `rank` jobs (after ingest + one-shot), `GET /api/feed` + seen/saved/dismissed — no web/mobile UI polish.
- **DB:** Add `topics` and `user_article_scores`; unique topic name per user; unique `(user_id, article_id)` scores with status enum and optional near-dup FK.
- **Worker:** Process `jobs.type = rank` in batches of ~20–50; enqueue after ingest; expose `pnpm worker:rank` / `NEWSROOM_WORKER_ONCE=rank`; never call Ollama from UI.
- **API + client:** Session-scoped topics + cursor feed with `topic`/`source` filters; wire `packages/api-client`; seed one example topic.
- **Verify + docs:** Mocked AI + keyword/feed tests; README rank/seed commands.
