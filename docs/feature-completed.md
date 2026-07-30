# Feature Completed

Shipped features registry. Complements [feature-backlog.md](./feature-backlog.md).

```bash
./scripts/record-feature-complete.sh <feature-id> [--issue N] [--note "..."]
```

---

## Recent completions

| Date | ID | Feature | GitHub | Notes |
|------|-----|---------|--------|-------|
| 2026-07-24 | `scaffold-monorepo` | Turborepo apps/packages, Compose, auth, health | #6 | auth + health monorepo scaffold |
| 2026-07-24 | `ingest-hn-substack` | HN + Substack adapters, article upsert | #12 | Completed via spec→implement pipeline |
| 2026-07-24 | `hybrid-rank-feed` | Keyword shortlist, Ollama rank, feed API | #19 | topics/feed APIs + worker rank; no UI polish |
| 2026-07-24 | `web-feed-topics-sources` | Elegant feed, topics, sources UI | #26 | editorial web feed/topics/sources/settings; PR #59 |
| 2026-07-25 | `web-topics-tree` | Topics UX: tree picker, keywords, weight help | #60 | Completed via spec→implement pipeline |
| 2026-07-25 | `web-topics-catalog` | Browse full topic catalog (not only my topics) | #67 | Catalog browse + one-click Follow on /topics (client merge) |
| 2026-07-26 | `web-ai-advisor-chat` | In-app AI chat for topic/keyword advice | #74 | Completed via spec→implement pipeline |
| 2026-07-26 | `web-source-discovery` | Discover/add feeds without knowing URLs | #85 | Completed via spec→implement pipeline |
| 2026-07-26 | `rank-dirty-incremental` | Dirty users + preference invalidation + ingest fanout | #92 | Dirty∩active ranking; preference invalidation; ingest fanout |
| 2026-07-26 | `rank-per-user-queue` | Per-user (or sharded) rank jobs; fair dequeue | #109 | Per-user rank jobs; unique open job on payload.userId; ingest/CLI fanout |
| 2026-07-26 | `ai-token-metering` | Count, reveal, and cap AI tokens (rank + chat) | #117 | Daily token rollups; Settings reveal; chat 429 / rank keyword-only on hard cap |
| 2026-07-26 | `rank-ai-budgets` | AI caps, active-user priority, keyword-only fallback | #125 | Per-run/day AI article caps; keyword-only beyond budget; Settings reveal |
| 2026-07-26 | `rank-score-retention` | TTL / prune `user_article_scores`; keep saved | #133 | Prune new/seen/dismissed by TTL+top-N; keep saved; post-rank + CLI |
| 2026-07-27 | `source-podcast` | Podcast RSS adapter + episode cards in feed | #100 | Podcast RSS adapter + episode cards; mobile deferred to mobile-feed-topics |
| 2026-07-27 | `wipe-rankings` | Wipe current rankings (keep saved/dismissed) | #143 | Wipe rankings button; keep saved/dismissed; no auto re-rank |
| 2026-07-28 | `web-elegant-refresh` | Elegant visual/UX polish across web client | #150 | Completed via spec→implement pipeline |
| 2026-07-28 | `ai-confirmed-topic-membership` | AI narrows keyword-matched topics; feed topic filter uses it | — | Lean in-chat implement; fixes "space" matching "workspace"-style false positives in topic filter |
| 2026-07-29 | `source-bluesky` | Bluesky adapter | #47 | Completed via spec→implement pipeline |
| 2026-07-30 | `introduce-themes` | User themes (background + density) + tighter controls | #158 | Completed via spec→implement pipeline |
| 2026-07-30 | `source-reddit` | Reddit adapter (subreddits → ranked feed) | #165 | Completed via spec→implement pipeline |
| 2026-07-30 | `ai-cloud-providers` | OpenAI + Google Gemini `AiProvider` (+ optional BYOK) | #175 | Completed via spec→implement pipeline |
| _—_ | _pipeline completions append here (newest first)_ | | | |

## A. Foundation

| ID | Feature | Completed | Spec | Notes |
|----|---------|-----------|------|-------|
| `scaffold-monorepo` | Turborepo apps/packages, Compose, auth, health | 2026-07-24 | `docs/architecture.md` | auth + health monorepo scaffold |

## B. Ingest and ranking

| ID | Feature | Completed | Spec | Notes |
|----|---------|-----------|------|-------|
| `ingest-hn-substack` | HN + Substack adapters, article upsert | 2026-07-24 | `docs/architecture.md` | Completed via spec→implement pipeline |
| `hybrid-rank-feed` | Keyword shortlist, Ollama rank, feed API | 2026-07-24 | `docs/architecture.md` | topics/feed APIs + worker rank; no UI polish |
| `ai-confirmed-topic-membership` | AI narrows keyword-matched topics; feed topic filter uses it | 2026-07-28 | `docs/decisions/004-ai-confirmed-topic-membership.md` | Lean in-chat implement |
| `ai-cloud-providers` | OpenAI + Google Gemini `AiProvider` (+ optional BYOK) | 2026-07-30 | `docs/architecture.md` | Completed via spec→implement pipeline |
## C. Web client

| ID | Feature | Completed | Spec | Notes |
|----|---------|-----------|------|-------|
| `web-feed-topics-sources` | Elegant feed, topics, sources UI | 2026-07-24 | `docs/architecture.md` | editorial web feed/topics/sources/settings; PR #59 |
| `web-topics-tree` | Topics UX: tree picker, keywords, weight help | 2026-07-25 | `docs/architecture.md` | Completed via spec→implement pipeline |
| `web-topics-catalog` | Browse full topic catalog (not only my topics) | 2026-07-25 | `docs/architecture.md` | Catalog browse + one-click Follow on /topics (client merge) |
| `web-ai-advisor-chat` | In-app AI chat for topic/keyword advice | 2026-07-26 | `docs/architecture.md` | Completed via spec→implement pipeline |
| `web-source-discovery` | Discover/add feeds without knowing URLs | 2026-07-26 | `docs/architecture.md` | Completed via spec→implement pipeline |
| `wipe-rankings` | Wipe current rankings (keep saved/dismissed) | 2026-07-27 | `docs/architecture.md` | Wipe rankings button; keep saved/dismissed; no auto re-rank |
| `web-elegant-refresh` | Elegant visual/UX polish across web client | 2026-07-28 | `docs/architecture.md` | Completed via spec→implement pipeline |
## Other

| ID | Feature | Completed | Spec | Notes |
|----|---------|-----------|------|-------|
| `rank-dirty-incremental` | Dirty users + preference invalidation + ingest fanout | 2026-07-26 | `docs/architecture.md` | Dirty∩active ranking; preference invalidation; ingest fanout |
| `rank-per-user-queue` | Per-user (or sharded) rank jobs; fair dequeue | 2026-07-26 | `docs/architecture.md` | Per-user rank jobs; unique open job on payload.userId; ingest/CLI fanout |
| `ai-token-metering` | Count, reveal, and cap AI tokens (rank + chat) | 2026-07-26 | `docs/architecture.md` | Daily token rollups; Settings reveal; chat 429 / rank keyword-only on hard cap |
| `rank-ai-budgets` | AI caps, active-user priority, keyword-only fallback | 2026-07-26 | `docs/architecture.md` | Per-run/day AI article caps; keyword-only beyond budget; Settings reveal |
| `rank-score-retention` | TTL / prune `user_article_scores`; keep saved | 2026-07-26 | `docs/architecture.md` | Prune new/seen/dismissed by TTL+top-N; keep saved; post-rank + CLI |
| `introduce-themes` | User themes (background + density) + tighter controls | 2026-07-30 | `docs/architecture.md` | Completed via spec→implement pipeline |
## E. Multi-user and channels

| ID | Feature | Completed | Spec | Notes |
|----|---------|-----------|------|-------|
| `source-podcast` | Podcast RSS adapter + episode cards in feed | 2026-07-27 | `docs/architecture.md` | Podcast RSS adapter + episode cards; mobile deferred to mobile-feed-topics |
| `source-bluesky` | Bluesky adapter | 2026-07-29 | `docs/architecture.md` | Completed via spec→implement pipeline |
| `source-reddit` | Reddit adapter (subreddits → ranked feed) | 2026-07-30 | `docs/architecture.md` | Completed via spec→implement pipeline |