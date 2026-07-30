# Handoff: source-reddit

**Status:** spec  
**Created:** 2026-07-30  
**Specifier agent:** lean thin handoff  
**Developer agent:** pending

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `source-reddit` |
| Parent issue | #165 — https://github.com/SpektrNO/newsroom/issues/165 |
| Open tasks | `db` (#167), `api` (#168), `worker` (#169), `web` (#170), `mobile` (#171), `verify` (#172), `docs` (#173) |
| Closed / Phase-1 | `spec` (#166) |
| Backlog | `docs/feature-backlog.md` § E — `source-reddit` |

Task order: `spec` → `db` → `api` → `worker` → `web` → ~~`mobile`~~ (defer) → `verify` → `docs`

## Intent

Signed-in users subscribe to Reddit **subreddits** by name and see recent posts in the same hybrid-ranked feed as HN / Substack / podcasts / Bluesky.

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| `source_type` | `"reddit"` |
| Config | `{ subreddit }` — normalized (no `r/` prefix, lowercase); many subs per user |
| Auth | Operator env only: required `REDDIT_USER_AGENT`; optional `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` for application-only OAuth. **No** end-user Reddit OAuth |
| Fetch | Prefer OAuth `oauth.reddit.com/r/{sub}/new` when credentials present; else public `www.reddit.com/r/{sub}/new.json` with User-Agent |
| Cap | ~50 posts per `fetchRecent()` |
| Canonical URL | `https://www.reddit.com{permalink}` (normalize); `externalId` = Reddit fullname `t3_…` |
| Skip | Removed/deleted/empty title; pure media with no title+text haystack |
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

*(Developer agent fills this section.)*
