# Handoff: source-reddit

**Status:** implementing  
**Created:** 2026-07-30  
**Specifier agent:** lean thin handoff  
**Developer agent:** in progress

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `source-reddit` |
| Parent issue | #165 — https://github.com/SpektrNO/newsroom/issues/165 |
| Open tasks | `verify` (#172), `docs` (#173) |
| Closed | `spec` (#166), `db` (#167), `api` (#168), `worker` (#169), `web` (#170), `mobile` (#171 deferred) |
| Backlog | `docs/feature-backlog.md` § E — `source-reddit` |

Task order: `spec` → `db` → `api` → `worker` → `web` → ~~`mobile`~~ (defer) → `verify` → `docs`

## Intent

Signed-in users subscribe to Reddit **subreddits** by name and see recent posts in the same hybrid-ranked feed as HN / Substack / podcasts / Bluesky.

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| `source_type` | `"reddit"` |
| Config | `{ subreddit }` — normalized (no `r/` prefix, lowercase); many subs per user |
| Auth | Operator env only: `REDDIT_USER_AGENT`; optional `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` for application-only OAuth. **No** end-user Reddit OAuth |
| Fetch | Prefer OAuth `oauth.reddit.com/r/{sub}/new` when credentials present; else public `www.reddit.com/r/{sub}/new.json` with User-Agent |
| Cap | ~50 posts per `fetchRecent()` |
| Canonical URL | `https://www.reddit.com{permalink}` (normalize); `externalId` = Reddit fullname `t3_…` |
| Skip | Removed/deleted/empty title |
| Uniqueness | Partial unique `(user_id, config->>'subreddit')` where `source_type = 'reddit'` |
| Mobile | Defer to `mobile-feed-topics` |

## Acceptance

1. `POST /api/sources` `{ sourceType: "reddit", config: { subreddit } }` creates subscription; invalid → 400; duplicate → 409.
2. Worker ingest via `createSourceAdapter("reddit", …)` upserts posts; feed filter `source=reddit`.
3. Sources UI: Add Reddit (subreddit name); feed filter **Reddit**; list shows `r/{sub}`.
4. Env documented in `.env.example` / ops; architecture + backlog ✅.
5. Adapter unit tests with fixture listing JSON.

## API / DB

| Piece | Notes |
|-------|-------|
| Unique index | `source_subscriptions_user_reddit_sub_uidx` |
| `SourceTypeV1` | include `reddit` |
| Config | `subreddit: string` |

## Out of scope

Comments as items, home/multi, catalog, HTML scrape, voting/posting, NSFW productization.

---

## Implementation result

### Changes

- DB: `subreddit` on config type; migration `0012_flowery_bucky.sql` unique index
- `packages/sources`: `RedditAdapter`, `normalizeSubredditName`, factory wiring + tests
- API: create/patch parse for reddit; feed `source=reddit`; api-client type
- Web: Sources Add Reddit; feed filter chip; prefs allowlist
- Docs: architecture, backlog ✅, README, `.env.example`, ops-local

### Verification

- [x] `pnpm --filter @newsroom/sources` reddit unit tests
- [x] web `sources.test.ts` / `feed.test.ts` / `feed-prefs.test.ts`
- [x] `pnpm --filter @newsroom/db migrate` applied locally
- [ ] Manual: add subreddit + worker ingest + Rank latest (needs Reddit UA / optional OAuth)

### Deviations from spec

- None material

### Follow-ups

- Curated Reddit catalog; stronger rate-limit/backoff if Reddit throttles anonymous JSON
