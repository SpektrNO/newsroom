# Handoff: Podcast RSS adapter + episode cards in feed

**Status:** done  
**Created:** 2026-07-27  
**Specifier agent:** spec complete  
**Developer agent:** complete

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `source-podcast` |
| Parent issue | #100 — https://github.com/SpektrNO/newsroom/issues/100 |
| Open tasks | *(none)* |
| Closed / Phase-1 | `spec` (#101), `db` (#102), `api` (#103), `worker` (#104), `web` (#105), `mobile` (#106 deferred), `verify` (#107), `docs` (#108) |
| Deferred | `mobile` (#106) → `mobile-feed-topics` |
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

*(unchanged — see prior revision / GitHub #101)*

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

## Out of scope

- In-app audio player, playback progress, offline download, chapter markers
- Transcript fetch/storage or transcript-based ranking
- Auto-follow “similar shows” or podcast graph discovery
- Paywalled / scraped episode body HTML (enclosure URL + RSS text only)
- Curated podcast catalog / `feed-catalog` podcast entries (preferred **follow-up**)
- **Mobile Expo UI** (`#106`): defer entirely to feature `mobile-feed-topics`
- Bluesky / X
- Changing HN or Substack ranking formulas beyond adding show-title text for podcast episodes

---

## Implementation result

### Changes

- **db:** Migration `0007` — `articles.show_title` / `duration_seconds` / `enclosure_url`; partial unique index `source_subscriptions_user_podcast_rss_uidx`.
- **api:** `SourceTypeV1` + create/PATCH + `?source=podcast`; `FeedItem` projects show/duration/enclosure.
- **worker / sources / ai:** `PodcastAdapter` + shared `rss.ts`; ingest persists media fields; keyword + AI rank include `showTitle`.
- **web:** Sources **Add podcast**; feed Podcast filter; card meta + external **Play audio**.
- **docs:** Architecture + backlog marked shipped via `record-feature-complete.sh`.
- **mobile (#106):** Closed deferred → `mobile-feed-topics`.

### Verification

- [x] How tested: `pnpm --filter @newsroom/sources test`, `@newsroom/ai test`; web `feed.test.ts` + `sources.test.ts`; typecheck db/sources/ai/api-client/worker/web.
- [x] What remains manual: `pnpm db:migrate` (0007), add a real podcast RSS, `worker:ingest` + `worker:rank`, confirm Feed Podcast filter / Play audio in browser.

### Deviations from spec

- None material. Feed topic re-filter and match counts also include `showTitle` so ranked show-only hits stay visible when filtering by topic.

### Follow-ups

- Podcast catalog entries + optional `kind` on `GET /api/feed-catalog`
- Show artwork (`itunes:image`) card polish
- Mobile episode card parity under `mobile-feed-topics`
