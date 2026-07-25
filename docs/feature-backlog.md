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

**Cadence policy (normative for B2):** Rank **dirty + active** users — not every ingest × every session cookie.

| Event | Effect |
|-------|--------|
| Ingest upserts articles for a user’s enabled subscriptions | Mark user **dirty** (affected users only). |
| Topic/source preference change (create/patch/delete/enable, keywords, weight) | Mark user **dirty**; invalidate/stale scores as specified in `rank-dirty-incremental`. |
| Scheduled ingest (~10–15 min, same as today) | After ingest, **enqueue AI rank only for users who are dirty and active**. |
| User opens feed / hits feed API while dirty | **Catch-up rank** (login or return from idle). |
| Dirty but idle (no recent feed activity) | Stay dirty; **do not** spend AI until they become active. |
| Clean user, no new matching candidates | Skip rank. |

- **Active** means recent feed (or equivalent product) activity — e.g. last **15–30 minutes** of `GET /api/feed` (or explicit heartbeat). A long-lived auth session alone is **not** active.
- **Coalesce:** at most one rank pass per user per short window (e.g. align with ingest interval) so tab spam / overlapping ingest+edit does not multiply AI calls.
- **Not** login-only (too stale while the tab stays open). **Not** “every ingest for all sessions” without an activity gate.

Notes for `rank-dirty-incremental` (do first):

- **Problem:** Topic/keyword/weight/follow changes and new ingest do not correctly refresh feeds; `worker:rank` still targets “all users with enabled topics,” and already-scored articles are skipped unless the *article* updated.
- **Dirty users:** Mark a user dirty when (a) their topics change (create/patch/delete/enable), (b) their sources change in a way that affects candidates, or (c) ingest upserts articles linked to their enabled subscriptions.
- **Invalidation:** On preference dirty, force rescore for that user (e.g. clear or stale-mark their `user_article_scores` except maybe `saved`/`dismissed` status preservation — decide in spec). Rank must re-run keyword pass with current topics.
- **Fanout:** Successful ingest marks **affected users dirty**; enqueue rank per **Cadence policy** (dirty ∩ active), not a global “everyone” pass.
- **Catch-up:** Feed (or rank-status) path may enqueue/wait for rank when the session user is dirty so returning users get a fresh feed without waiting for the next ingest.
- **Activity signal:** Record last feed activity (timestamp on user or side table) from authenticated feed reads; used to define **active** for post-ingest enqueue.
- **CLI:** `pnpm worker:rank` processes dirty users (or drains dirty queue); optional single-user flag and optional `--all-dirty` (ignore activity) for local debug/ops.
- **Out of scope:** Hosted AI provider swap (see `multiuser-harden`); per-user job rows (`rank-per-user-queue`).

Notes for `rank-per-user-queue`:

- **Problem:** One single-flight global rank job serializes all users and fails as a unit.
- **Jobs:** `rank` payloads carry `userId` (or shard id); many pending rank jobs; workers claim fairly (oldest dirty / round-robin).
- **Compatibility:** Keep ingest → dirty fanout + cadence enqueue from `rank-dirty-incremental`; replace in-process “loop all dirty users” with enqueue-per-user where needed.
- **Out of scope:** AI dollar caps (`rank-ai-budgets`).

Notes for `rank-ai-budgets`:

- **Problem:** AI dominate cost/latency at user × shortlist scale.
- **Budgets:** Per-user (and optionally global) max AI-scored articles per run/day; prefer **active** dirty users (see Cadence policy).
- **Degrade:** Over budget → keyword-only `final_rank` (existing `combineFinalRank` null-AI path); inactive dirty users skip AI until they return (catch-up on activity).
- **Depends on:** Dirty/incremental ranking + activity gate so budgets aren’t burned re-scoring everyone every ingest tick.
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
| `web-ai-advisor-chat` | In-app AI chat for topic/keyword advice | ⬜ | `docs/architecture.md` |

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

Notes for `web-ai-advisor-chat`:

- **Goal:** Signed-in users chat with the AI about interests (e.g. “I’m into local-first sync and LLMs — what topics and keywords should I follow?”) and get actionable suggestions grounded in Newsroom’s model (catalog leaves + matchable keyword tokens).
- **Surfaces:** Web chat UI (dedicated `/chat` or Topics-adjacent panel — decide in spec); session-authenticated `POST /api/chat` (streaming optional in a follow-up). Mobile later (`mobile-feed-topics` or a thin follow-on).
- **AI boundary:** UI never calls Ollama. BFF uses `packages/ai` `AiProvider.complete` (same provider as rank). Add a small advisor helper (prompt + parse) in `packages/ai`; keep rank prompts separate.
- **Context to the model (v1):** curated topic-tree selectable labels (and light hierarchy crumbs if cheap); user’s current Following (names + keywords); short system instructions that keywords must be **substring-friendly** tokens (not full catalog phrases alone) and topic **names** must be selectable catalog leaves when suggesting Follow targets.
- **Structured suggestions (required):** Model may reply in prose, but must also return machine-readable suggestions the UI can act on, e.g. `{ "replies": "...", "suggestions": [{ "topicLabel": "LLMs & agents", "keywords": ["llm","agent","tool use"], "rationale": "…" }] }`. Prefer catalog labels; if the model invents a non-catalog name, UI shows it as text-only (no one-click Follow) or maps to nearest leaf — decide in spec.
- **Actions:** One-click **Follow** / **Add keywords** to an existing followed topic from a suggestion chip (reuse `POST /api/topics` / `PATCH`); user confirms before write.
- **Primary use cases (v1):** interest → suggested topics + keywords; refine keywords for a followed topic; explain why a keyword is too broad/narrow. **Out of scope v1:** chatting about individual feed articles, multi-turn tool use that mutates DB without confirm, long-term memory across devices beyond short server-side transcript (optional: persist last N turns per user in Postgres — decide in spec; default **ephemeral session transcript** in client + request history window).
- **Limits:** Per-user rate limit (messages/min and/or tokens/day); shared or separate budget from `rank-ai-budgets` / `multiuser-harden`. Fail soft when provider down (same health story as rank).
- **Privacy:** Session user only; never send other users’ topics or chat history.
- **Depends on:** Existing topic tree + Follow APIs. Stronger with hosted AI (`multiuser-harden`) for latency/quality; works locally via Ollama.
- **Does not replace:** Catalog browse / Follow; advisor **suggests**, user still owns Following.

## D. Mobile client

| ID | Feature | Status | Spec |
|----|---------|--------|------|
| `mobile-feed-topics` | Expo feed + topics (thin sources) | ⬜ | `docs/architecture.md` |

## E. Multi-user and channels

| ID | Feature | Status | Spec |
|----|---------|--------|------|
| `multiuser-harden` | Registration, isolation, rate limits, host AI swap | ⬜ | `docs/architecture.md` |
| `source-bluesky` | Bluesky adapter | ⬜ | `docs/architecture.md` |
