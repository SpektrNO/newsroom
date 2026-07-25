# Handoff: Discover/add feeds without knowing URLs

**Status:** done  
**Created:** 2026-07-26  
**Specifier agent:** lean (supervisor)  
**Developer agent:** complete (lean)

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `web-source-discovery` |
| Parent issue | #85 — https://github.com/SpektrNO/newsroom/issues/85 |
| Open tasks | *(none)* |
| Closed tasks | `spec` (#86), `api` (#87), `web` (#88), `verify` (#89), `docs` (#90) |
| Backlog | `docs/feature-backlog.md` § C — Notes for `web-source-discovery` |

Task order: `spec` → `api` → `web` → `verify` → `docs`

## Intent

Signed-in users browse a curated catalog of RSS feeds on Sources and add them with one click, so discovery does not require already knowing newsletter URLs.

## User-facing spec

Curated feed catalog v1 on `/sources` via `GET /api/feed-catalog`; one-click Add feed with confirm; Advisor suggestions deferred.

### Acceptance criteria

1. Signed-in `GET /api/feed-catalog` returns version + feeds; 401 when signed out.
2. Sources Catalog shows feeds; already-subscribed show **Added**.
3. Add feed confirms then creates via existing sources API.
4. Manual URL form still works.
5. Tests cover catalog helpers / URL match.
6. No Ollama / Advisor changes in this feature.

## Implementation result

### Delivered

- `apps/web/src/lib/feed-catalog.ts` — static editorial RSS catalog
- `GET /api/feed-catalog` + `api-client.listFeedCatalog`
- Sources Catalog UI with topic-tag filter + Add feed / Added
- `isFeedAlreadyAdded` via `normalizeCanonicalUrl`
- Unit tests in `feed-catalog.test.ts`

### Verification

- `pnpm --filter @newsroom/web exec node --import tsx --test src/lib/feed-catalog.test.ts`
- `pnpm --filter @newsroom/web typecheck`

### Deviations

- Lean v1 = catalog only; Advisor feed suggestions left as follow-up.

### Follow-ups

- Advisor suggesting catalog feeds; search/slug resolve; expand catalog entries.
