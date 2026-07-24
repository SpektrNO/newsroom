# Decision: ingest URL + HN fetch choices

**Date:** 2026-07-24  
**Feature:** `ingest-hn-substack`

## Context

Ingest needs a stable article identity and a deterministic HN fetch path for local/CI fixtures.

## Decisions

1. **Canonical URLs** — `normalizeCanonicalUrl` in `@newsroom/sources`: lowercase host, strip `#fragment`, drop default ports, remove trailing slash except origin `/`, preserve query. Applied to article URLs and Substack `rssUrl` uniqueness.

2. **Hacker News** — Firebase only (`/v0/topstories|newstories` + `/v0/item/{id}`). Batch cap **100** items per `fetchRecent`. Algolia HN Search deferred (architecture allows both; Firebase is enough for v1).

3. **Job cadence** — Worker self-enqueues the next `ingest` job **12 minutes** after completion (single-flight: no second pending/running ingest).

4. **Seed Substack** — `https://www.platformer.news/feed` as the documented example RSS URL.

## Consequences

- Adapter/unit tests mock Firebase + RSS HTTP; no live HN required in CI.
- Changing trailing-slash policy later requires a one-time URL remigration to avoid duplicate `articles` rows.
