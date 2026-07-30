# Handoff: Bluesky AT Proto adapter + account posts in feed

**Status:** done  
**Created:** 2026-07-29  
**Specifier agent:** spec complete  
**Developer agent:** complete

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `source-bluesky` |
| Parent issue | #47 — https://github.com/SpektrNO/newsroom/issues/47 |
| Open tasks | *(none — all closed; parent #47 stays open for PR)* |
| Closed tasks | `spec` (#48), `db` (#49), `api` (#50), `worker` (#51), `web` (#52), `mobile` (#53 deferred), `verify` (#54), `docs` (#55) |
| Phase-1 closed | `spec` (#48) |
| Backlog | `docs/feature-backlog.md` § E — `source-bluesky` ✅ |
| Pattern ref | Shipped sibling `source-podcast` — `docs/handoffs/archive/2026-07-27-source-podcast.md` |

Task order: `spec` → `db` → `api` → `worker` → `web` → ~~`mobile`~~ (defer) → `verify` → `docs`

## Intent

Signed-in users subscribe to Bluesky **accounts** by handle (or DID) and see that account’s recent **posts** in the same hybrid-ranked feed as HN / Substack / podcast items — with author handle and an external open link to the post on bsky.app. No Bluesky login, no in-app Bluesky client.

## Decisions (locked)

| Topic | Decision | Rationale |
|-------|----------|-----------|
| `source_type` | **`"bluesky"`** (already reserved in `packages/sources` / architecture) | Distinct filter label, uniqueness index, and UX; stub adapter exists today |
| Subscribe model | **Per-account author feed** (many accounts per user) | Mirrors Substack/podcast “follow this publisher”; architecture: AT Proto public endpoints — not personal timeline or firehose |
| Subscribe config | `{ handle: string }` after normalize; optional resolved `did?: string` may be stored later by ingest | Handle is what users type; DID is stable if handle moves — v1 may store handle only and resolve each fetch |
| Handle normalize | Trim; strip leading `@`; lowercase ASCII; keep DID strings as-is (`did:plc:…` / `did:web:…`) | Deterministic uniqueness + API actor param |
| Auth / credentials | **None.** Call Bluesky **public AppView** `https://public.api.bsky.app` unauthenticated | Architecture: “AT Proto public endpoints”; no app passwords, OAuth, or session secrets in Newsroom |
| Primary XRPC | `GET …/xrpc/app.bsky.feed.getAuthorFeed?actor=…&limit=…&filter=posts_no_replies` | Public, no auth; skips reply noise. Paginate with `cursor` only if needed to fill cap |
| Post set | **Original posts + quote posts**; **exclude pure reposts** (`reason` = `app.bsky.feed.defs#reasonRepost`) | Rank on the account’s own text; reposts are noise for topic matching |
| Skip empty | Skip posts with no usable text (after trim); skip deleted/missing `post` | Need ranking haystack |
| Canonical URL | `https://bsky.app/profile/{handleOrDid}/post/{rkey}` derived from AT URI `at://{did}/app.bsky.feed.post/{rkey}` Prefer handle in path when known | Browser-friendly open; upsert key = normalized URL |
| `externalId` | Full AT URI (`at://…`) | Stable across handle changes; maps to `article_sources.external_id` |
| Title / summary | **Title:** first line of post text, truncated ~120 chars if needed. **Summary:** full post text (may equal title for short posts) | Fits existing `NormalizedArticle` / feed cards without new columns |
| External link embeds | **Do not** replace canonical URL with embed URI; text-only for ranking | Post is the unit; open on Bluesky (v1). Link-as-article is a follow-up |
| Media / images | No first-class media columns; no image gallery in feed cards | Podcast already owns enclosure fields; Bluesky images out of scope |
| Ranking text | Same hybrid keyword + AI path; haystack = **title + summary** (post text). Author is display meta (not required in scorer for v1) | Matches HN/Substack text ranking; avoid podcast-style extra columns |
| Discovery v1 | **Manual handle/DID entry only** | Same as podcast RSS-first; no Bluesky catalog |
| AppView host | Default `https://public.api.bsky.app`; optional env override `BLUESKY_APPVIEW_URL` (no trailing slash) if useful for tests/mirrors | Document in README only if the env var ships |
| Fetch cap | Default **~50** posts per subscription per `fetchRecent()` (test-overridable); stay ≤ AppView `limit` max (100) | Align with HN-style batch caps; keep ingest bounded |
| Mobile (#53) | **Out of scope** this feature — defer to `mobile-feed-topics` (Expo still stub) | Same as `source-podcast` #106; keep API types mobile-safe |
| Duplicate policy | Same user + same normalized handle + `bluesky` → `duplicate` (409) | Partial unique index like podcast RSS |

## User-facing spec

| Field | Value |
|-------|-------|
| Trigger | User adds a Bluesky account on Sources; worker ingest runs; rank includes new articles |
| Surfaces | `packages/sources` adapter · `packages/db` uniqueness · Next.js `/api/sources*` + `GET /api/feed?source=` · worker ingest · web Sources + Feed · docs |
| Copy | Sources section **Add Bluesky**; label **Handle**; placeholder e.g. `jay.bsky.social`; button **Add Bluesky**; list type label **Bluesky**; feed filter option **Bluesky**; errors: duplicate → “That source is already added.”; invalid handle → “Check the Bluesky handle.”; unsupported remains unused for bluesky once shipped |
| Acceptance | See criteria below |

### Acceptance criteria

1. **Subscribe:** Signed-in `POST /api/sources` with `{ sourceType: "bluesky", config: { handle } }` creates a subscription; empty/invalid handle shape → `invalid_config` (400); duplicate same user + same normalized handle + `bluesky` → `duplicate` (409); signed out → 401. Previously `unsupported_source_type` for bluesky is **removed** (bluesky becomes a supported v1 type alongside HN/Substack/podcast).
2. **List/filter sources:** `GET /api/sources` returns bluesky rows; Sources UI lists them as **Bluesky** with the handle (and DID if stored); user can enable/disable/delete like other sources. `PATCH` may update `enabled` and/or `config.handle` (re-normalize; uniqueness applies).
3. **Ingest:** Worker `createSourceAdapter("bluesky", config)` calls public AppView `getAuthorFeed` (no Bluesky credentials). Maps posts → `NormalizedArticle` with `url`, `title`, `summary`, `publishedAt`, optional `author` (display name or handle), `externalId` (AT URI), optional `raw`. Excludes pure reposts and empty-text posts. Uses `filter=posts_no_replies`. No HTML scrape of bsky.app pages.
4. **Persist:** Articles upsert on canonical bsky.app post URL; `article_sources.source_type = 'bluesky'`; link to originating `source_subscription_id`. No new article columns required for v1.
5. **Rank:** Same hybrid keyword + AI path as other sources on title + summary. Topic-matching posts appear in the ranked feed.
6. **Feed filter:** `GET /api/feed?source=bluesky` returns only bluesky-sourced items; invalid `source` values still 400; web filter includes **Bluesky**.
7. **Feed UX (v1):** Cards show source label **Bluesky** and author when known; open via `canonicalUrl` (external). No embed widget, no like/repost actions, no image carousel.
8. **Manual discovery:** Sources page supports adding by handle/DID without a catalog.
9. **Auth/config:** No Bluesky app password, OAuth, or per-user AT Proto session in Newsroom settings. Better Auth remains the only identity. Optional `BLUESKY_APPVIEW_URL` for the AppView base only.
10. **Tests:** Adapter unit tests with fixture `getAuthorFeed` JSON (original post, quote post, pure repost skipped, empty text skipped); API allowlist/filter tests for `bluesky`; Sources UI + feed filter coverage consistent with podcast patterns.
11. **Docs (task `docs`):** Update `docs/architecture.md` Bluesky row → v1 / this feature; backlog status; README only if new env/commands appear.
12. **Mobile (#53):** Close as deferred → `mobile-feed-topics` (no Expo Sources/Feed work in this feature).

## API / DB contract

### Config / types

| Field | Type | Notes |
|-------|------|-------|
| `source_type` | `"bluesky"` | On `source_subscriptions` and `article_sources` |
| `config.handle` | string | Required; normalized as above before insert/uniqueness |
| `config.did` | string? | Optional; may be filled after successful resolve — not required for create |
| `SourceTypeV1` | include `"bluesky"` | `apps/web` + `packages/api-client` (today excludes bluesky) |
| `SourceSubscriptionConfig` | add `handle?`, `did?` | Keep `rssUrl` / `mode` for other types |

### DB

| Change | Detail |
|--------|--------|
| Unique index | Partial unique on `(user_id, (config->>'handle'))` where `source_type = 'bluesky'` (name e.g. `source_subscriptions_user_bluesky_handle_uidx`) |
| Articles | **No** new columns for v1 (reuse title/summary/author/url/raw) |
| Migrations | New Drizzle migration for the unique index only (unless implementer stores DID and needs nothing else) |

### `NormalizedArticle` mapping (Bluesky)

| Field | Required | Source |
|-------|----------|--------|
| `url` | yes | `https://bsky.app/profile/{handle\|did}/post/{rkey}` |
| `title` | yes | First line / truncated post text |
| `summary` | no | Full post text |
| `author` | no | `post.author.displayName` or handle |
| `publishedAt` | no | `post.record.createdAt` |
| `externalId` | yes (prefer) | AT URI |
| `raw` | no | Feed view item or post view (debug) |
| `showTitle` / `durationSeconds` / `enclosureUrl` | unused | Leave unset |

### HTTP API

All existing Better Auth session rules apply.

| Endpoint | Change |
|----------|--------|
| `POST /api/sources` | Accept `sourceType: "bluesky"` + `{ handle }`; stop returning `unsupported_source_type` for bluesky |
| `GET /api/sources` | Return bluesky rows in list |
| `PATCH /api/sources/:id` | Allow `enabled` / `config.handle` for bluesky rows |
| `DELETE /api/sources/:id` | Unchanged (ownership-scoped) |
| `GET /api/feed?source=bluesky` | Allow `bluesky` in source filter parser |
| `GET /api/feed-catalog` | **No** Bluesky entries required |

**Errors (unchanged codes):** `401`, `400` `{ "error": "invalid_config" }`, `409` `{ "error": "duplicate" }`, `400` `{ "error": "unsupported_source_type" }` only for truly unknown types.

### Adapter factory

Replace `StubSourceAdapter("bluesky")` with `BlueskyAdapter` in `createSourceAdapter`. Inject `fetch` for tests. Default AppView base as above.

### Worker

No new job type. Existing `ingest` loads enabled subscriptions including `bluesky`, calls adapter, upserts articles + `article_sources`. One subscription failure must not fail the whole job (same partial-success rules as today).

## Touchpoints

- `packages/sources` — `BlueskyAdapter`, tests/fixtures; `create-adapter.ts`; export types/config
- `packages/db` — migration + `SourceSubscriptionConfig`; seed optional example handle (nice-to-have, not required)
- `apps/web/src/lib/sources.ts` + routes — allowlist bluesky; parse handle
- `apps/web/src/lib/feed.ts` — `parseFeedSourceFilter` + feed projection if needed
- `packages/api-client` — `SourceTypeV1` + create helpers
- `apps/worker` — no special-case beyond factory (confirm ingest uses `createSourceAdapter`)
- `apps/web` Sources + Feed UI — Add Bluesky form; filter option; labels
- `docs/architecture.md`, `docs/feature-backlog.md` — status (docs task)
- Must not contradict architecture: Bluesky via AT Proto **public** endpoints; X remains deferred

## Out of scope

- Bluesky OAuth, app passwords, posting, likes, follows, DMs, or storing user AT Proto credentials
- Personal “Following” timeline / custom feeds / starter packs as subscription types
- Firehose / Jetstream realtime ingest
- `app.bsky.feed.searchPosts` (requires auth) or keyword search across Bluesky
- Curated Bluesky account catalog
- In-app Bluesky embed, image gallery, video, or thread UI
- Using external link embeds as the article canonical URL
- Changing HN / Substack / podcast adapters or ranking formulas beyond allowing bluesky-sourced text through the existing path
- **Mobile Expo UI** (`#53`): defer entirely to `mobile-feed-topics`
- X / Twitter adapter

## Open questions (non-blocking)

None product-blocking. Implementer may choose whether to persist resolved `did` on first successful fetch; if yes, prefer DID as `actor` on subsequent fetches when present, keep `handle` for UI.

---

## Implementation result

### Changes

- **db:** `SourceSubscriptionConfig.handle` / `did`; migration `0011` partial unique `source_subscriptions_user_bluesky_handle_uidx`
- **api:** `SourceTypeV1` includes `bluesky`; create/patch parse + normalize handle; `parseFeedSourceFilter` allows `bluesky`; `packages/api-client` types; `normalizeBlueskyHandle` in `@newsroom/sources`
- **worker:** `BlueskyAdapter` (public AppView `getAuthorFeed`, skip reposts/empty); wired in `createSourceAdapter` (ingest unchanged)
- **web:** Sources **Add Bluesky** form; list labels; feed filter option **Bluesky**
- **mobile:** Deferred (`#53` closed → `mobile-feed-topics`)
- **docs:** architecture Bluesky → v1; backlog ✅; README / `.env.example` `BLUESKY_APPVIEW_URL`

### Verification

- [x] `pnpm --filter @newsroom/sources test` (BlueskyAdapter fixtures + handle normalize)
- [x] `apps/web` `sources.test.ts` + `feed.test.ts` unit tests
- [x] typecheck: sources, web, api-client, db
- [ ] Worker/web DB integration tests + live ingest — need local Postgres / migrate `0011` (manual)

### Deviations from spec

- Resolved `did` is accepted on adapter config and preferred as AppView `actor` when present, but ingest does **not** write `did` back onto `source_subscriptions.config` after fetch (handle-only storage in v1).

### Follow-ups

- Bluesky account catalog / discovery polish
- Optional: promote external link embeds to optional “open linked URL” affordance
- Mobile Sources/Feed parity under `mobile-feed-topics`
- Persist resolved DID on subscription after first successful fetch
- Authenticated AppView features (search) only if product later requires them — would need credential story

---

## Handoff summary (for developer)

- Ship `source_type: "bluesky"` end-to-end: subscribe by normalized **handle/DID**, ingest via **unauthenticated** public AppView `getAuthorFeed` (`posts_no_replies`, skip pure reposts), upsert posts as articles with bsky.app canonical URLs.
- Mirror **podcast** patterns for API allowlist, uniqueness index, Sources “Add …” UI, and feed `?source=` filter — without podcast media columns.
- No Bluesky auth in Newsroom; Better Auth only. Defer Expo (`#53`) like podcast mobile.
- Acceptance is observable: create/list/filter sources, ingest fixtures → ranked feed cards that open on Bluesky, tests + architecture/backlog docs on the `docs` task.
