# Handoff: Discover/add feeds without knowing URLs

**Status:** spec  
**Created:** 2026-07-26  
**Specifier agent:** lean (supervisor)  
**Developer agent:** pending

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `web-source-discovery` |
| Parent issue | #85 — https://github.com/SpektrNO/newsroom/issues/85 |
| Open tasks | `spec` (#86), `api` (#87), `web` (#88), `verify` (#89), `docs` (#90) |
| Backlog | `docs/feature-backlog.md` § C — Notes for `web-source-discovery` |

Task order: `spec` → `api` → `web` → `verify` → `docs`

## Intent

Signed-in users browse a curated catalog of RSS feeds on Sources and add them with one click, so discovery does not require already knowing newsletter URLs.

## User-facing spec

| Field | Value |
|-------|-------|
| Trigger | User opens `/sources` to find newsletters / RSS feeds. |
| Surfaces | Web Sources + `GET /api/feed-catalog`. Reuse `POST /api/sources`. |
| Acceptance | See below. |

### Decisions (lean v1)

| Topic | Decision |
|-------|----------|
| Scope | **Curated feed catalog only** (backlog step 1). Advisor feed suggestions deferred. |
| Data | Static module in `apps/web` (like topic-tree); no DB table. |
| Match “already added” | Normalize `rssUrl` with `normalizeCanonicalUrl`; case-insensitive compare to user’s substack sources. |
| Add | Confirm → `POST /api/sources` `{ sourceType: "substack", config: { rssUrl }, enabled: true }`. |
| Tags | Optional `topicTags` (catalog leaf labels) for display/filter chips — not required to Follow topics. |

### API

`GET /api/feed-catalog` (session):

```json
{
  "version": 1,
  "feeds": [
    {
      "id": "platformer",
      "label": "Platformer",
      "rssUrl": "https://www.platformer.news/feed",
      "blurb": "Tech policy and platforms.",
      "topicTags": ["AI & infra"]
    }
  ]
}
```

### Web UI (`/sources`)

1. Keep existing Add feed form + Following list.
2. Add **Catalog** section: list curated feeds; **Added** vs **Add feed**; confirm before create.
3. Optional filter by topic tag (simple chip or select) if cheap.

### Copy

| Key | String |
|-----|--------|
| Catalog heading | `Catalog` |
| Catalog lede | `Browse suggested feeds. Add one to start ingesting it into your ranked list.` |
| Add feed | `Add feed` |
| Adding | `Adding…` |
| Added | `Added` |
| Confirm | `Add “{label}” to your sources?` |
| Empty catalog | `No catalog feeds yet.` |
| Duplicate | `That source is already added.` |

### Acceptance criteria

1. Signed-in `GET /api/feed-catalog` returns version + feeds; 401 when signed out.
2. Sources Catalog shows feeds; already-subscribed show **Added** (no second add).
3. Add feed confirms then creates via existing sources API; list refreshes.
4. Manual URL form still works.
5. Tests cover catalog helpers / URL match.
6. No Ollama / Advisor changes in this feature.

### Out of scope

- Advisor suggesting feeds; Substack search/slug resolve; social popularity; auto-subscribe; DB-backed catalog.

## Implementation result

*(pending)*
