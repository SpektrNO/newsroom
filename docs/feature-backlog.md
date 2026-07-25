# Feature Backlog

Segmentation index for feature-by-feature implementation.

```text
/spec-only <issue#|feature-id|title fragment>
/spec-and-implement <issue#|feature-id|title fragment> — full
/lean-implement <issue#|feature-id|title fragment>
```

Agents load parent issue + sub-tasks via `./scripts/load-feature-issue.sh`.

**Legend:** ✅ Implemented · 🟡 Partial · ⬜ Spec only

Shipped: [feature-completed.md](./feature-completed.md)

GitHub lifecycle: [github-workflow.md](./github-workflow.md)

Architecture: [architecture.md](./architecture.md)

---

## A. Foundation

| ID | Feature | Status | Spec |
|----|---------|--------|------|
| `scaffold-monorepo` | Turborepo apps/packages, Compose, auth, health | ✅ | `docs/architecture.md` |

## B. Ingest and ranking

| ID | Feature | Status | Spec |
|----|---------|--------|------|
| `ingest-hn-substack` | HN + Substack adapters, article upsert | ✅ | `docs/architecture.md` |
| `hybrid-rank-feed` | Keyword shortlist, Ollama rank, feed API | ✅ | `docs/architecture.md` |

### B2. Ranking scale (post-MVP)

Personal scores and shared articles stay. Replace “one rank pass walks every user” with incremental, queued, budgeted work so ~10²–10³ users remain viable. **Implement in order** (each depends on the previous unless noted).

| ID | Feature | Status | Spec |
|----|---------|--------|------|
| `rank-dirty-incremental` | Dirty users + preference invalidation + ingest fanout | ⬜ | `docs/architecture.md` |
| `rank-per-user-queue` | Per-user (or sharded) rank jobs; fair dequeue | ⬜ | `docs/architecture.md` |
| `rank-ai-budgets` | AI caps, active-user priority, keyword-only fallback | ⬜ | `docs/architecture.md` |
| `rank-score-retention` | TTL / prune `user_article_scores`; keep saved | ⬜ | `docs/architecture.md` |

Notes for `rank-dirty-incremental` (do first):

- **Problem:** Topic/keyword/weight/follow changes and new ingest do not correctly refresh feeds; `worker:rank` still targets “all users with enabled topics,” and already-scored articles are skipped unless the *article* updated.
- **Dirty users:** Mark a user dirty when (a) their topics change (create/patch/delete/enable), (b) their sources change in a way that affects candidates, or (c) ingest upserts articles linked to their enabled subscriptions.
- **Invalidation:** On preference dirty, force rescore for that user (e.g. clear or stale-mark their `user_article_scores` except maybe `saved`/`dismissed` status preservation — decide in spec). Rank must re-run keyword pass with current topics.
- **Fanout:** Successful ingest enqueues rank work for **affected users only**, not a global “everyone” pass.
- **CLI:** `pnpm worker:rank` processes dirty users (or drains dirty queue); optional single-user flag for local debug.
- **Out of scope:** Hosted AI provider swap (see `multiuser-harden`); per-user job rows (`rank-per-user-queue`).

Notes for `rank-per-user-queue`:

- **Problem:** One single-flight global rank job serializes all users and fails as a unit.
- **Jobs:** `rank` payloads carry `userId` (or shard id); many pending rank jobs; workers claim fairly (oldest dirty / round-robin).
- **Compatibility:** Keep ingest → fanout enqueue from `rank-dirty-incremental`; replace in-process “loop all dirty users” with enqueue-per-user where needed.
- **Out of scope:** AI dollar caps (`rank-ai-budgets`).

Notes for `rank-ai-budgets`:

- **Problem:** AI dominate cost/latency at user × shortlist scale.
- **Budgets:** Per-user (and optionally global) max AI-scored articles per run/day; prefer users with recent session/feed activity.
- **Degrade:** Over budget → keyword-only `final_rank` (existing `combineFinalRank` null-AI path); inactive users skip AI until they return.
- **Depends on:** Dirty/incremental ranking so budgets aren’t burned re-scoring everyone.
- **Related:** `multiuser-harden` (host AI / provider swap) — budgets apply to whichever `AiProvider` is configured.

Notes for `rank-score-retention`:

- **Problem:** `user_article_scores` grows with users × retained items.
- **GC:** Drop or archive old `new`/`seen` rows past TTL or outside top-N by `final_rank`; **keep** `saved` (and document `dismissed` policy).
- **Worker:** Periodic cleanup job or rank-adjacent prune; feed/API behavior unchanged for remaining rows.
- **Can ship after** dirty incremental; independent of AI budgets if storage pressure appears earlier.

## C. Web client

| ID | Feature | Status | Spec |
|----|---------|--------|------|
| `web-feed-topics-sources` | Elegant feed, topics, sources UI | ✅ | `docs/architecture.md` |
| `web-topics-tree` | Topics UX: tree picker, keywords, weight help | ✅ | `docs/architecture.md` |
| `web-topics-catalog` | Browse full topic catalog (not only my topics) | ✅ | `docs/architecture.md` |

Notes for `web-topics-tree` (shipped):

- Topic **name** comes from a curated hierarchical **topic tree** (selectable leaves only); label stored in existing `topics.name` (no catalog id column).
- **Keywords** are free-text chips/tokens; matching remains **case-insensitive** via ranking keyword pass.
- **Weight** has in-UI help for keyword scoring / hybrid blend (see `docs/decisions/002-hybrid-ranking.md`).
- Thin `GET /api/topic-tree` serves catalog v1; create/patch validate `name` against selectable labels. Mobile can follow later via `mobile-feed-topics`.

Notes for `web-topics-catalog` (shipped):

- `/topics` shows **Following** (user’s registered topics with CRUD) plus **Catalog** (full curated tree from `GET /api/topic-tree`).
- Selectable leaves show **Following** vs **Available** via case-insensitive match of `topics.name` ↔ leaf `label` (session user only).
- One-click **Follow** creates via `POST /api/topics` with defaults `name=label`, `keywords=[label]`, `weight=1`, `enabled=true`; refine via Edit.
- **Out of scope (unchanged):** other users’ topics, social/popular discovery, schema/ranking changes, mobile (`mobile-feed-topics`).
- Client-side merge of listTopics + listTopicTree; no new follow endpoint.

## D. Mobile client

| ID | Feature | Status | Spec |
|----|---------|--------|------|
| `mobile-feed-topics` | Expo feed + topics (thin sources) | ⬜ | `docs/architecture.md` |

## E. Multi-user and channels

| ID | Feature | Status | Spec |
|----|---------|--------|------|
| `multiuser-harden` | Registration, isolation, rate limits, host AI swap | ⬜ | `docs/architecture.md` |
| `source-bluesky` | Bluesky adapter | ⬜ | `docs/architecture.md` |
