# Handoff: Podcast RSS adapter + episode cards in feed

**Status:** spec  
**Created:** 2026-07-27  
**Specifier agent:** spec complete  
**Developer agent:** pending

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `source-podcast` |
| Parent issue | #100 — https://github.com/SpektrNO/newsroom/issues/100 |
| Open tasks | `db` (#102), `api` (#103), `worker` (#104), `web` (#105), `verify` (#107), `docs` (#108) |
| Closed / Phase-1 | `spec` (#101) |
| Deferred | `mobile` (#106) → defer to `mobile-feed-topics` (see Out of scope) |
| Backlog | `docs/feature-backlog.md` § E — Notes for `source-podcast` |

Task order: `spec` → `db` → `api` → `worker` → `web` → ~~`mobile`~~ (skip) → `verify` → `docs`

## Intent

Signed-in users subscribe to podcasts by RSS/Atom URL and see matching **episodes** in the same hybrid-ranked feed as HN/Substack stories, with show name, duration, and an external open/play link — no in-app player.

## Decisions (locked)

| Topic | Decision | Rationale |
|-------|----------|-----------|
| `source_type` | **`"podcast"`** (distinct from `"substack"`) | Separate filter label, uniqueness index, and UX; architecture already lists podcasts as their own source |
| Subscribe config | `{ rssUrl: string }` (normalized like Substack) | Same discovery pattern; reuse URL normalization |
| Same URL as newsletter + podcast | **Allowed** (different `source_type`) | Rare; avoid cross-type unique coupling |
| Episode canonical URL | Prefer `item.link` / episode page; else enclosure URL; skip item if neither | Browser-friendly open; dedupe on page URL when present |
| Episode media fields | First-class optional on `NormalizedArticle` → nullable DB columns → `FeedItem` | Feed API does not expose `raw`; cards need show/duration/enclosure |
| Ranking text | Keyword + AI haystack includes **show title** when known, plus title + summary | Backlog: match show + episode text; `author` alone is not scored today |
| Discovery v1 | **Manual RSS URL only** | Catalog extension is preferred follow-up, not blocking |
| Mobile (#106) | **Out of scope** this feature | Expo feed still deferred to `mobile-feed-topics`; keep API mobile-safe |

## User-facing spec

| Field | Value |
|-------|-------|
| Trigger | User adds a podcast RSS/Atom URL on Sources (or already has `source_type: podcast` subscriptions); worker ingests; after rank, episodes appear in feed |
| Surfaces | worker (ingest + rank), API (`/api/sources`, `/api/feed`), web (Sources + Feed). Mobile UI deferred |
| Copy | See below |
| Acceptance | See acceptance criteria |

### Copy (web)

| Surface | String |
|---------|--------|
| Feed source filter option | `Podcast` |
| Feed card source label | `Podcast` (when `sources[].sourceType === "podcast"`) |
| Feed card duration (when known) | Human-readable: `<m> min` if &lt; 60m; else `<h>h <m>m` (omit seconds unless &lt; 1 min → `<s>s`) |
| Feed card show | Show title in meta when known (with source · show · duration · author · time — omit missing parts) |
| Primary link | Episode title → `canonicalUrl` (new tab / external, same as today) |
| Secondary link (when `enclosureUrl` present and ≠ `canonicalUrl`) | `Play audio` → opens `enclosureUrl` externally |
| Sources list type label | `Podcast` |
| Sources list config summary | Normalized `rssUrl` |
| Add podcast control | Distinct from newsletter: label **Add podcast** (or equivalent section); creates `sourceType: "podcast"` |
| Errors | Reuse existing: `unsupported_source_type`, `invalid_config`, `duplicate` with podcast-appropriate messaging where copy is type-specific |

### Acceptance criteria

1. **Subscribe:** Signed-in `POST /api/sources` with `{ sourceType: "podcast", config: { rssUrl } }` creates a subscription; invalid/empty URL → `invalid_config` (400); duplicate same user + same normalized `rssUrl` + `podcast` → `duplicate` (409); signed out → 401.
2. **List/filter sources:** `GET /api/sources` returns podcast rows; Sources UI lists them as **Podcast** with URL; user can enable/disable/delete like other sources.
3. **Ingest:** Worker `createSourceAdapter("podcast", config)` fetches RSS/Atom, maps episodes → `NormalizedArticle` with title, summary, url, publishedAt, optional author, `externalId`, and optional `showTitle` / `durationSeconds` / `enclosureUrl`. Parses enclosure + common iTunes/podcast duration/author/show fields when present. No HTML scrape of episode pages; no paywall body fetch.
4. **Persist:** Articles upsert on canonical URL; `article_sources.source_type = 'podcast'`; media fields stored and available to feed projection.
5. **Rank:** Same hybrid keyword + AI path as other sources. Keyword and AI inputs include **show title** when known (in addition to title + summary). Episodes with topic matches appear in the ranked feed.
6. **Feed filter:** `GET /api/feed?source=podcast` returns only podcast-sourced items; invalid source values still 400; web filter includes **Podcast**.
7. **Feed UX (v1):** Episode cards show show name and duration when known; open via `canonicalUrl`; optional **Play audio** for enclosure; **no** in-app audio player, waveform, or transcript UI.
8. **Manual discovery:** Sources page supports adding a podcast by RSS/Atom URL without a catalog.
9. **Catalog:** Not required for v1 pass. If touched incidentally, must not break newsletter catalog (`substack` + `isFeedAlreadyAdded`).
10. **Tests:** Adapter unit tests with fixture RSS including enclosure + itunes:duration (and a no-enclosure episode page link case); API allowlist/filter tests for `podcast`; feed card / sources UI coverage as appropriate to existing patterns.
11. **Docs (task `docs`):** Update `docs/architecture.md` source table (Podcasts → v1 / this feature) and backlog status; README only if new commands appear (unlikely).

## API / DB contract

PostgreSQL-backed; Better Auth session required for sources + feed (unchanged).

### `source_type`

Add `"podcast"` to all app allowlists (DB remains `text`):

- `packages/sources` `SourceType`
- `packages/api-client` `SourceTypeV1` and `ListFeedOptions.source`
- `apps/web` `parseCreateBody` / PATCH validation (`apps/web/src/lib/sources.ts`)
- `apps/web` `parseFeedSourceFilter` (`apps/web/src/lib/feed.ts`)
- Web feed + sources UI labels/filters

`bluesky` remains unsupported for create (stub) unless already handled; do not regress.

### `source_subscriptions`

| Field | Value |
|-------|-------|
| `source_type` | `"podcast"` |
| `config` | `{ "rssUrl": "<normalized https URL>" }` |
| Uniqueness | New partial unique index: one row per `(user_id, config->>'rssUrl')` where `source_type = 'podcast'` (mirror Substack pattern) |

### `NormalizedArticle` extensions (`packages/sources`)

Existing fields unchanged. Add optional:

| Field | Type | Notes |
|-------|------|-------|
| `showTitle` | `string?` | Feed/channel title or itunes author/show when available |
| `durationSeconds` | `number?` | Parsed from `itunes:duration` / similar (`HH:MM:SS`, `MM:SS`, or raw seconds) |
| `enclosureUrl` | `string?` | Audio (or media) enclosure URL; normalize when storing |

`contentHash` may remain `url\|title\|summary\|author` for v1 (media-only edits do not force re-hash).

### `articles` (DB)

Add nullable columns (names may match Drizzle style used in repo):

| Column | Type | Notes |
|--------|------|-------|
| `show_title` | `text` null | From `NormalizedArticle.showTitle` |
| `duration_seconds` | `integer` null | Non-negative; null if unknown |
| `enclosure_url` | `text` null | Distinct from `canonical_url` when both exist |

Migration required (`db` task). Ingest must map new fields on upsert.

### `GET /api/feed` — `FeedItem` extensions

Add optional nullable fields to API + `packages/api-client` `FeedItem`:

| Field | Type | Notes |
|-------|------|-------|
| `showTitle` | `string \| null` | |
| `durationSeconds` | `number \| null` | |
| `enclosureUrl` | `string \| null` | |

Existing fields unchanged. `?source=podcast` allowed. Ranking/status/cursor behavior unchanged.

### `POST /api/sources`

```json
{ "sourceType": "podcast", "config": { "rssUrl": "https://example.com/podcast.xml" }, "enabled": true }
```

Response shape unchanged (`Source` with `sourceType: "podcast"`).

### `GET /api/feed-catalog`

**No v1 requirement** to list podcasts. Follow-up: extend entries with optional `kind: "newsletter" | "podcast"` (default newsletter) and wire Add → `sourceType: "podcast"` when kind is podcast; update `isFeedAlreadyAdded` accordingly. Document as follow-up only.

### Ranking contract

- Keyword scorer and `RankArticleInput` / worker rank path must include show title text when present (exact field plumbing left to implementer: extend input vs concatenate into summary for score-only — prefer explicit `showTitle` on rank input to avoid polluting displayed summary).
- Enclosure URL and duration must **not** affect scores.

## Touchpoints

Best-guess; implementer confirms:

| Area | Paths |
|------|-------|
| Types / adapter | `packages/sources/src/types.ts`, `create-adapter.ts`, new `podcast.ts` (+ tests); prefer shared RSS helpers extracted from `substack.ts` rather than a greenfield fetcher |
| DB | `packages/db/src/schema/ingest.ts` + Drizzle migration (columns + partial unique index) |
| Ingest | `apps/worker/src/ingest.ts` (persist new columns); factory already type-driven |
| Rank | `packages/ai` keyword + rank inputs; `apps/worker/src/rank.ts` |
| API validation | `apps/web/src/lib/sources.ts`, `apps/web/src/lib/feed.ts` |
| Client | `packages/api-client/src/index.ts` |
| Web | `apps/web/src/components/sources-client.tsx`, `feed-client.tsx` |
| Docs | `docs/architecture.md`, `docs/feature-backlog.md` (`docs` task) |

Must not contradict `docs/architecture.md` ingest contract (`fetchRecent() → NormalizedArticle[]`, config on `source_subscriptions`). Architecture currently marks Podcasts as **later** — expected; `docs` task flips status when shipping. No conflict with hybrid rank or Better Auth.

## Out of scope

- In-app audio player, playback progress, offline download, chapter markers
- Transcript fetch/storage or transcript-based ranking
- Auto-follow “similar shows” or podcast graph discovery
- Paywalled / scraped episode body HTML (enclosure URL + RSS text only)
- Curated podcast catalog / `feed-catalog` podcast entries (preferred **follow-up**)
- **Mobile Expo UI** (`#106`): defer entirely to feature `mobile-feed-topics`. Implementer should close #106 with a comment pointing at that feature (do not build podcast-only mobile chrome here). API/`FeedItem` extensions must remain usable by mobile later
- Bluesky / X
- Changing HN or Substack ranking formulas beyond adding show-title text for podcast episodes

## Open questions

None blocking. Non-blocking follow-ups:

1. Podcast catalog entries + `kind` on `GET /api/feed-catalog`
2. Whether show artwork (`itunes:image`) belongs in a later card polish pass
3. Mobile episode card parity under `mobile-feed-topics`

---

## Handoff summary

- New `source_type: "podcast"` with `{ rssUrl }` config, partial unique index, and allowlist updates across sources/feed/api-client/UI.
- Podcast adapter reuses RSS parsing (extend/`rss-parser` customFields); map episodes to `NormalizedArticle` + `showTitle` / `durationSeconds` / `enclosureUrl`; persist nullable article columns; project on `FeedItem`.
- Same hybrid rank; include show title in keyword + AI text; feed filter + cards: Podcast label, show, duration, external open + optional Play audio — no player.
- Discovery v1 = manual Add podcast URL only; catalog is follow-up. Skip `#106` mobile → `mobile-feed-topics`.
- Task order after this spec: `db` → `api` → `worker` → `web` → skip `mobile` → `verify` → `docs`.

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
