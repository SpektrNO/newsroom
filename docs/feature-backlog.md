# Feature Backlog

Segmentation index for feature-by-feature implementation.

**Legend:** ✅ Implemented · 🟡 Partial · ⬜ Spec only

Shipped: [feature-completed.md](./feature-completed.md)

GitHub lifecycle: [github-workflow.md](./github-workflow.md)

Architecture: [architecture.md](./architecture.md)

Contributing: [contributing.md](./contributing.md)

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
| `ai-confirmed-topic-membership` | AI narrows keyword-matched topics; feed topic filter uses it | ✅ | `docs/decisions/004-ai-confirmed-topic-membership.md` |

### B2. Ranking scale (post-MVP)

Personal scores and shared articles stay. Replace “one rank pass walks every user” with incremental, queued, budgeted work so ~10²–10³ users remain viable. **Implement in order** (each depends on the previous unless noted).

| ID | Feature | Status | Spec |
|----|---------|--------|------|
| `rank-dirty-incremental` | Dirty users + preference invalidation + ingest fanout | ✅ | `docs/architecture.md` |
| `rank-per-user-queue` | Per-user (or sharded) rank jobs; fair dequeue | ✅ | `docs/architecture.md` |
| `rank-ai-budgets` | AI caps, active-user priority, keyword-only fallback | ✅ | `docs/architecture.md` |
| `rank-score-retention` | TTL / prune `user_article_scores`; keep saved | ✅ | `docs/architecture.md` |

**Cadence policy (normative for B2):** Rank **dirty + active** users — not every ingest × every session cookie.

| Event | Effect |
|-------|--------|
| Ingest upserts articles for a user’s enabled subscriptions | Mark user **dirty** (affected users only). |
| Topic/source preference change (create/patch/delete/enable, keywords, weight) | Mark user **dirty**; clear **keyword-miss** evaluations only (keep scored hits). |
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
- **Invalidation:** On preference dirty, clear **miss** evaluations only so previously skipped articles can match new keywords; **keep** scored hits (`user_article_scores` for `new`/`seen`/`saved`/`dismissed`) and hit evaluations. Explicit **Wipe rankings** still deletes `new`/`seen` scores.
- **Fanout:** Successful ingest marks **affected users dirty**; enqueue rank per **Cadence policy** (dirty ∩ active), not a global “everyone” pass.
- **Catch-up:** Feed (or rank-status) path may enqueue/wait for rank when the session user is dirty so returning users get a fresh feed without waiting for the next ingest.
- **Activity signal:** Record last feed activity (timestamp on user or side table) from authenticated feed reads; used to define **active** for post-ingest enqueue.
- **CLI:** `pnpm worker:rank` processes dirty users (or drains dirty queue); optional single-user flag and optional `--all-dirty` (ignore activity) for local debug/ops.
- **Out of scope:** Hosted AI provider swap (see `ai-cloud-providers`); per-user job rows (`rank-per-user-queue`).

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
- **Related:** `ai-cloud-providers` (OpenAI/Google `AiProvider`); token accounting via `ai-token-metering` (prefer meter before or with this feature).

Notes for `rank-score-retention`:

- **Problem:** `user_article_scores` grows with users × retained items; shared `articles` also accumulate forever.
- **GC scores:** Drop old `new`/`seen` rows past TTL or outside top-N by `final_rank`; **keep** `saved`; prune old `dismissed` by TTL.
- **GC articles:** Delete ingested rows older than `ARTICLE_TTL_DAYS` (default **90**) by `COALESCE(published_at, created_at)`; **never** delete an article any user has `saved`. Cascades sources + remaining scores/evaluations for **all** users. Same TTL is the feed/rank/pipeline age window (`feedMaxAgeCutoff`). Multi-user: one prune can desync other users’ unsaved rankings from the shared corpus — see architecture caveat; revisit under `multiuser-harden` if needed.
- **Worker:** Periodic/`pnpm worker:prune-scores` runs score prune then article prune; each rank pass prunes scores per user and articles once at the end.
- **Can ship after** dirty incremental; independent of AI budgets if storage pressure appears earlier.

### B3. AI token metering

Shared foundation for Advisor and ranking cost control. **Prefer before or alongside** `rank-ai-budgets` so article caps and chat limits use the same meter.

| ID | Feature | Status | Spec |
|----|---------|--------|------|
| `ai-token-metering` | Count, reveal, and cap AI tokens (rank + chat) | ✅ | `docs/architecture.md` |

Notes for `ai-token-metering`:

- **Goal:** Every `AiProvider.complete` call reports **prompt / completion / total** tokens; Newsroom **persists** usage per user (and optionally global), **shows** it in the product, and **enforces** soft/hard caps so local Ollama and later hosted models cannot run unbounded.
- **Count (`packages/ai`):** Extend `AiCompleteResult` with `usage?: { promptTokens, completionTokens, totalTokens }` (and optional `estimated: boolean`). `OllamaProvider` maps `prompt_eval_count` / `eval_count` from `/api/generate` when present; otherwise a documented estimator (e.g. chars/4) marked `estimated: true`. Rank + advisor helpers must not drop usage on the way to callers.
- **Persist:** Per-user ledger — at least daily rollups by purpose (`rank` \| `chat` \| `other`); optional append-only event rows for audit. Session user only; never mix users. Schema in `packages/db` (decide tables in spec; no chat transcript required).
- **Reveal:** Settings (primary) shows used vs limit for today / period (prompt+completion or total — pick one display unit in spec). Optional: Advisor composer footer or chat response meta (`tokens` on `POST /api/chat`); ops/logs for worker rank batches. Absolute timestamps / hover detail allowed; keep UI calm (no dashboard card wall).
- **Cap:** Configurable per-user (and optional global) token budget per day (env + later settings). Over soft cap → warn in UI; over hard cap → `429` `{ "error": "token_budget_exceeded" }` for chat; rank path **degrades** (keyword-only / skip AI batch) rather than failing the whole job. Align purpose splits so chat spam cannot silently exhaust rank budget unless product chooses a shared pool (default: **shared daily pool** with purpose breakdown in the UI).
- **Relation to other features:** `rank-ai-budgets` remains **article/batch** caps and active-user priority; this feature is **token** accounting. Advisor v1 message rate limit stays; token cap is the durable budget. Hosted billing / `ai-cloud-providers` / `multiuser-harden` should consume the same meter.
- **Out of scope v1:** Dollar pricing UI, per-model price tables, streaming token ticks, admin multi-tenant consoles.

### B4. Cloud AI providers

Rank and Advisor already go through `AiProvider` (`packages/ai`); today only `OllamaProvider` is wired. Add OpenAI- and Google-compatible implementations so deploys (and later users) can leave local Ollama.

| ID | Feature | Status | Spec |
|----|---------|--------|------|
| `ai-cloud-providers` | OpenAI + Google Gemini `AiProvider` (operator-hosted) | ✅ | `docs/architecture.md` |
| `ai-cloud-providers-byok` | Per-user encrypted OpenAI/Google keys (BYOK) | ✅ | `docs/architecture.md` |

Notes for `ai-cloud-providers`:

- **Goal:** Ship concrete `AiProvider` implementations for **OpenAI** (Chat Completions or Responses API) and **Google** (Gemini generateContent), selectable beside Ollama, without changing rank/advisor prompt contracts.
- **Interface (locked):** Keep `complete({ prompt, system?, json?, maxTokens? })` → `{ text, model, usage? }` and `health()`. Map `json: "object" | "rank-array" | true` to each vendor’s JSON / schema mode (or strict prompt fallback when unsupported). Propagate real token usage into `ai-token-metering` (no silent drop).
- **v1 — operator-hosted (required):** Env-selected provider for the whole deploy, e.g. `AI_PROVIDER=ollama|openai|google` plus `OPENAI_API_KEY` / `OPENAI_BASE_URL?` / `OPENAI_MODEL`, `GOOGLE_AI_API_KEY` (or Vertex later) / `GOOGLE_AI_MODEL`. Factory used by worker rank and web BFF (`/api/chat`, Rank latest). Document in `.env.example` + `docs/ops-local.md`. Default remains Ollama when unset.
- **v1 — model tiers:** Map existing Settings rank tiers (`fast` / `standard` / `none`) onto cloud model ids via env (e.g. `RANK_MODEL_FAST` / `RANK_MODEL_STANDARD` already exist — reuse; add cloud-specific overrides only if needed). `none` stays keyword-only.
- **Factory / wiring:** Central `createAiProvider(...)` in `packages/ai` (or thin apps wrappers) so worker + web do not each hardcode Ollama. Health: `/api/health` reports configured provider reachability (not Ollama-only forever).
- **Cost / abuse:** Reuse `ai-token-metering` + `rank-ai-budgets`; cloud keys make hard caps more important. No browser→OpenAI/Google calls (same AI boundary as today).
- **Relation to `multiuser-harden`:** That feature stays registration, isolation, rate limits, and product multi-tenancy. **Provider implementations live here**; multiuser-harden may depend on this for “hosted AI” deploys but should not reinvent `AiProvider`.
- **Out of scope v1:** Anthropic/other vendors (easy follow-on once factory exists), streaming chat, fine-tuning, image/audio models, Vertex-only enterprise auth beyond a simple API key path, dollar billing UI, BYOK (see `ai-cloud-providers-byok`).
- **Depends on:** Existing `AiProvider` + rank/advisor helpers + token metering. Independent of new source adapters.
- **Verify:** Unit tests with mocked HTTP for both providers (JSON rank array parse, usage mapping, health fail/ok); one manual path: set `AI_PROVIDER=openai` (or google), Rank latest + Advisor message, Settings usage ticks up.

Notes for `ai-cloud-providers-byok`:

- **Goal:** Optional per-user encrypted API key + provider (`openai` \| `google`) in Settings; worker/BFF resolve provider **per user** for that user’s rank/chat; else fall back to operator `AI_PROVIDER`.
- **Storage:** `user_ai_credentials` (1:1 with user); AES-256-GCM with `AI_CREDENTIALS_KEY` (64 hex chars). If key unset → BYOK API `503 byok_not_configured`.
- **API:** Never return plaintext after save; GET returns configured + last-4 hint + provider; PUT set; DELETE clear.
- **Out of scope:** Ollama BYOK, Anthropic, key rotation UI, mobile Settings, per-user model id overrides beyond rank tiers.
- **Depends on:** Shipped `ai-cloud-providers`. Align threat model later with `security-harden`.

## C. Web client

| ID | Feature | Status | Spec |
|----|---------|--------|------|
| `web-feed-topics-sources` | Elegant feed, topics, sources UI | ✅ | `docs/architecture.md` |
| `web-topics-tree` | Topics UX: tree picker, keywords, weight help | ✅ | `docs/architecture.md` |
| `web-topics-catalog` | Browse full topic catalog (not only my topics) | ✅ | `docs/architecture.md` |
| `web-ai-advisor-chat` | In-app AI chat for topic/keyword advice | ✅ | `docs/architecture.md` |
| `web-source-discovery` | Discover/add feeds without knowing URLs | ✅ | `docs/architecture.md` |
| `web-source-feed-search` | Search RSS/Atom feeds via LangSearch (BFF) | ✅ | `docs/architecture.md` |
| `web-feed-offline-cache` | Cached feed scroll when API/server is unreachable | ⬜ | `docs/architecture.md` |
| `web-opml-import-export` | OPML import/export for source subscriptions | ⬜ | `docs/architecture.md` |
| `wipe-rankings` | Wipe current rankings (keep saved/dismissed) | ✅ | `docs/architecture.md` |
| `web-elegant-refresh` | Elegant visual/UX polish across web client | ✅ | `docs/architecture.md` |
| `introduce-themes` | User themes (background + density) + tighter controls | ✅ | `docs/architecture.md` |

Notes for `web-feed-offline-cache`:

- **Goal:** When the API, Postgres, or whole host is unreachable, a signed-in user can still **scroll the last successfully loaded feed** instead of seeing an empty error state.
- **Problem today:** `FeedClient` loads only via live `GET /api/feed` (session + DB every time). On failure it clears items. Prefs/theme live in `localStorage`; feed items do not. No service worker / IndexedDB.
- **MVP (read-only cache):** After each successful `listFeed`, persist the returned page(s) client-side (**IndexedDB** preferred over `localStorage` for size). Key at least by user id (from session/client knowledge) + a cache key for the active filter/sort query (or v1: cache only the **default / last-used** feed view). On network error, offline, or 5xx from `listFeed`, hydrate from cache and show a calm banner: cached feed, server unreachable, timestamp of last sync. Do **not** empty the list when cache exists.
- **Offline UX:** Disable or no-op **Rank latest**, **Wipe rankings**, and **Load more** beyond what is cached. Save / Dismiss / Seen: **disable** in v1 (no silent local-only status that diverges). External article links still need the open web; that is fine.
- **Auth:** Cached path must **bypass** `/api/feed` entirely (no live cookie/DB check). Fresh data still requires a normal session when online. If the browser has never successfully loaded a feed for this user, offline stays empty with a clear message.
- **Retention:** Cap cached items (e.g. last ~100–200 stories or last N pages) and/or TTL (e.g. 7 days); document eviction. Overwrite on successful online fetch for the same cache key.
- **Cold open when the host is down (optional in same feature or follow-up):** MVP helps a tab that already had the app JS. Serving the shell when `apps/web` itself is down needs a **service worker / PWA** (cache app shell + static assets) or a CDN-hosted shell. Spec should call this out as **P0 shell** vs **P1 cold-open**; ship IndexedDB feed cache first if scope is tight.
- **Out of scope v1:** On-device ingest or ranking; local Postgres/SQLite corpus; offline Topics/Sources/Advisor/Settings mutations; multi-filter full offline browsing beyond the cached key; mobile/Expo (`mobile-feed-topics` can reuse the idea later via AsyncStorage); outbox sync for Save/Dismiss (follow-up).
- **Follow-ups (do not block MVP):** Offline mutation outbox; expose `matchedTopicIds` on feed items for richer offline filters; prefetch next page while online to deepen cache; PWA shell; mobile parity.
- **Depends on:** Shipped `web-feed-topics-sources` / `FeedClient` + `FeedItem` payload (title, rank, reason, URL, sources, status already sufficient to render the list).
- **Verify:** Load feed online → go offline (devtools) → reload client path still shows items + banner; Rank/Wipe/Save disabled; online fetch refreshes cache; second browser profile / different user must not see the other user’s cached items; no new server schema required.

Notes for `web-opml-import-export`:

- **Goal:** Let users migrate to/from Feedly, Inoreader, and other readers via standard OPML so switching into Newsroom does not require re-adding every RSS URL by hand.
- **Model mismatch (normative):** OPML carries **feeds** (and optional folders). Newsroom separates **sources** (`category` + `adapter` + `config`) from **topics** (catalog leaf + keywords + weight). Import/export must not pretend OPML folders are topics.
- **Import (primary):** Session-authenticated upload/parse of OPML 1.0/2.0. For each outline with `xmlUrl` (or equivalent), create `source_subscriptions` with `adapter: "rss"`, `config.rssUrl` normalized, `enabled: true`. Deduplicate against the user’s existing RSS unique index (skip or report duplicates; do not 500 the whole import). Cap batch size (e.g. soft max ~500 outlines) with a clear error when exceeded.
- **Category heuristics (import):** Infer `category` best-effort — podcast signals (itunes / enclosure-oriented titles, common podcast hosts) → `podcast`; newsletter-ish titles → `newsletter`; else default `website` (or `community` only when clearly an aggregator/community feed). Always show a **preview** of proposed sources (title, url, category) before commit; user can edit category or deselect rows. Invalid/missing URLs → skip with count in result summary.
- **Folders → topics (optional assist, not auto-write):** OPML folder titles may be offered as **suggestions** only (e.g. map folder `AI` → nearest selectable topic-tree leaf + starter keywords). User confirms Follow / Add keywords; never invent non-catalog topic names as writable follows. Prefer linking this assist to existing Topics Follow APIs + optional Advisor; v1 may ship import-sources-only and leave folder→topic assist as an explicit follow-up in the same feature if scope slips.
- **Non-RSS outlines:** Skip Twitter/X, email digests without `xmlUrl`, and other non-feed rows; summarize skipped count. Do **not** invent HN / Bluesky / Reddit subscriptions from OPML.
- **Export:** Download OPML for the session user’s **RSS** sources only (`adapter: "rss"`), with `xmlUrl` = `config.rssUrl`, `text`/`title` from a stable label (stored title if we add one; else hostname/path). Optionally nest under outline folders named by `category` (`website` / `newsletter` / `podcast` / `community`). Omit `hackernews` / `bluesky` / `reddit` from portable OPML (document in UI). Round-trip of topics/keywords is **out of scope** for standard OPML — if full backup is needed later, use a separate JSON export feature.
- **API (sketch):** `POST /api/sources/opml/import` (multipart or raw XML; dry-run/preview flag then commit) and `GET /api/sources/opml/export` (returns `application/xml` or `text/x-opml` attachment). Session cookie only; never accept unauthenticated uploads. Reuse existing create-source validation paths where possible rather than a parallel write path.
- **UI:** Sources page — **Import OPML** / **Export OPML** near Add / Suggested. Import flow: file pick → preview table → Confirm. Export: immediate download. Calm copy that topics are configured separately on Topics.
- **Mark dirty:** Successful import that creates sources marks the user **dirty** (same as manual source create) so ingest/rank pick up new feeds; do not auto Rank latest.
- **Out of scope v1:** Mobile/Expo; OPML as topic/keyword backup; Newsroom-namespaced OPML extensions for HN/Bluesky/Reddit; scraping feed titles beyond outline text; replacing curated catalog / LangSearch discovery.
- **Depends on:** Shipped Sources create API + category/adapter model (`web-source-discovery`). Stronger with topic catalog if folder→topic assist ships in the same feature.
- **Verify:** Fixture OPML from Feedly/Inoreader-style nesting; preview then import creates RSS rows only; duplicates skipped; export re-imports cleanly for RSS; session isolation (user A cannot import into user B); malformed XML → `400`.

Notes for `wipe-rankings`:

- **Goal:** Signed-in user can clear ranked feed scores without losing Saved/Dismissed.
- **Behavior:** Delete `new`/`seen` `user_article_scores`; drop orphan keyword evaluations; clear dirty so feed does **not** auto catch-up rank. No auto re-rank — user hits **Rank latest** when ready.
- **Surface:** Feed toolbar beside Rank latest; confirm before wipe.
- **Out of scope:** Wiping saved/dismissed; cancelling in-flight rank jobs; mobile.

Notes for `web-elegant-refresh`:

- **Goal:** Same simple, editorial app — slightly more elegant, a touch of restrained color, clearer button/filter/dropdown hierarchy. Visual/structural only; no behavior or API changes.
- **Scope:** All authenticated surfaces — Feed, masthead/app-shell, Topics, Sources, Advisor (chat), Settings. **Out of scope:** landing/sign-in/sign-up, mobile (Expo), new UI dependencies, dark mode.
- **Buttons:** consolidate to exactly two variants — **primary** (solid `--accent` fill; one main action per view: Follow, Add feed, Save) and **secondary/ghost** (outlined; everything else: Rank latest, Wipe rankings, Save/Dismiss, filter toggles). Remove `.catalog-follow` as a separate idiom; reuse primary. Keep plain **danger-text** for destructive text actions.
- **Selects:** keep native `<select>` (no new JS dependency); restyle via `appearance: none` + custom chevron + matching border/radius/focus ring to match text inputs.
- **Chips:** round `.topic-filter-chip` to match input/button radius; active state gets soft teal fill + border, inactive stays neutral outline.
- **Color accents:** add one secondary accent token (`--accent-warm`, reusing the existing amber radial already in the body gradient) for sparing emphasis (e.g. "needs rank" / unread state). Teal stays primary; no broader color system.
- **Feed pipeline row → compact status bar:** clearer labeled stat cluster, right-aligned Rank latest / Wipe rankings grouped as a pair, warm accent when `needsRank` is true.
- **Topics weight help:** short 1–2 line summary + native `<details>` disclosure instead of an inline wall of prose.
- **Empty feed state:** replace developer CLI copy (`pnpm db:seed`) with user-facing guidance + links to `/topics` and `/sources`.
- **Tokens:** define `--surface` (currently referenced but undefined); add `--radius-sm` / `--radius-md` / `--radius-lg` reused consistently for inputs, chips, buttons, panels.
- **Orphan classes:** give `.feed-page` / `.chat-page` / `.manage-main` real layout rules or remove from JSX if redundant — decide per-case, note in handoff.
- **Docs:** short `docs/decisions/00N-web-design-tokens.md` capturing the button/radius/select/chip conventions for future UI consistency.

Notes for `introduce-themes`:

- **Goal:** Signed-in users pick a light **atmosphere** (background / page tint) and a slight **view density**, and the chrome (buttons, selects, chips) stops wasting horizontal/vertical space — calmer personalization without a full theme engine.
- **Background:** A small fixed set of presets (e.g. 3–5) that only retune CSS variables already used for body atmosphere (`--bg`, gradient stops, maybe `--surface` / `--border` soft variants). **Not** arbitrary color pickers. Keep the editorial teal accent; do not invent a parallel brand palette per theme. Avoid the usual AI-theme traps (purple gradients, cream+terracotta, broadsheet hairlines) already called out in design rules.
- **View-mode:** One compact toggle — **Comfortable** (current) vs **Compact** (tighter feed item padding, filter gaps, pipeline row). Density is orthogonal to background preset.
- **Tighten controls (required in same feature):** Shrink default padding/min-width on ghost buttons, native `<select>`s, filter fields, and chip rows so View/Sort/Sources controls hug their content; search field can stay slightly wider. No new component library. Prefer token tweaks (`--radius-*`, shared control height) over one-off overrides.
- **Surface:** Settings section **Appearance** (or **Theme**) with preset swatches + density control; apply live via `data-theme` / `data-density` on `<html>` or app shell. Optional: tiny shortcut later — Settings is enough for v1.
- **Persist (v1):** `localStorage` per browser (simplest). Document that clearing site data resets appearance. Follow-up under `multiuser-harden` if we want `user` columns / API so theme follows login across devices.
- **Scope:** Authenticated web shell (Feed, Topics, Sources, Advisor, Settings). **Out of scope v1:** full dark mode, custom CSS, per-route themes, mobile/Expo, user-uploaded wallpapers, high-contrast a11y theme beyond what presets naturally provide.
- **Depends on:** Tokens from `web-elegant-refresh`. No ranking/API changes.
- **Verify:** Switch presets + density; reload keeps choice; controls visibly tighter on Feed filters; no layout jump that hides Rank latest / Wipe.

Notes for `web-topics-tree` (shipped):

- Topic **name** comes from a curated hierarchical **topic tree** (selectable leaves only); label stored in existing `topics.name` (no catalog id column).
- **Keywords** are free-text chips/tokens; matching remains **case-insensitive** via ranking keyword pass.
- **Weight** has in-UI help for keyword scoring / hybrid blend (see `docs/decisions/002-hybrid-ranking.md`).
- Thin `GET /api/topic-tree` serves catalog v1; create/patch validate `name` against selectable labels. Mobile can follow later via `mobile-feed-topics`.

Notes for `web-topics-catalog` (shipped):

- `/topics` is a **single catalog browse tree** (search + Follow / Following + Manage). No separate Following list or always-on Add form.
- Selectable leaves show **Follow** or **Following** + **Manage** via case-insensitive match of `topics.name` ↔ leaf `label` (session user only).
- One-click **Follow** creates via `POST /api/topics` with defaults `name=label`, leaf starter keywords, `weight=1`, `enabled=true`; **Manage** opens keywords / weight / enabled / delete (auto-opens after Follow).
- **Keyword inheritance:** ranking and feed `topic=` filters also match **ancestor** catalog path tokens (e.g. Evals & safety ← AI & Machine Learning ← Technology) at a weaker weight (`0.1 × topic.weight` vs `0.25` for primary keywords). Shared tree lives in `@newsroom/ai`.
- Toolbar: Following count + **All | Following only** filter.
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
- **Limits:** Per-user message rate limit (v1); token day-caps via `ai-token-metering`. Soft-fail when provider down (same health story as rank).
- **Privacy:** Session user only; never send other users’ topics or chat history.
- **Depends on:** Existing topic tree + Follow APIs. Stronger with hosted AI (`ai-cloud-providers`) for latency/quality; works locally via Ollama. Token reveal/cap → `ai-token-metering`.
- **Does not replace:** Catalog browse / Follow; advisor **suggests**, user still owns Following.

Notes for `web-source-discovery` (shipped — catalog v5):

- **Problem:** Ranking only filters what you already ingest. HN is a shared firehose (discovery built-in); Substack-style sources previously required the user to **already know** an RSS URL.
- **Shipped:** Static curated feed catalog (`GET /api/feed-catalog`); Sources **Suggested** and **Add** share five categories (Website / Community / Newsletter / Podcast / Social); Me labels match; subscribed catalog rows omitted; Me collapsible (default collapsed). Persisted `category` + `adapter`. Substack/dev.to → community; digests like TLDR → newsletter.
- **Follow-ups:** `web-source-feed-search` (LangSearch RSS/Atom discovery); `web-opml-import-export` (Feedly/Inoreader migration); Advisor feed suggestions; usage-based suggestions.
- **Out of scope (unchanged):** Scraping paywalled bodies; scraping Substack’s entire network; social popularity; auto-subscribe.

Notes for `web-source-feed-search`:

- **Goal:** On Sources, let users search by site/name (e.g. `nrk.no`) and pick a discovered RSS/Atom URL without already knowing the feed path.
- **Provider:** LangSearch Web Search API — `POST https://api.langsearch.com/v1/web-search`, Authorization `Bearer ${LANGSEARCH_API_KEY}`. Key stays on the server only.
- **BFF:** Session-authenticated `POST /api/feed-search` with `{ "query": string }`. Browser never calls LangSearch. For bare domains: (1) sequentially fetch `https://www.{domain}/` (apex only if needed; ~20s timeout — nrk.no is slow and rejects parallel GETs) and read `<link rel="alternate" type="application/rss+xml|atom+xml">`, expand linked RSS directories; soft-probe `/rss`, `/feeds`, `/about/rss-feeds/` only when the homepage yielded no feeds; (2) also query LangSearch with `"${domain} feed"` and keep on-host feed-like hits. Never invent concrete feed URLs. Call LangSearch with `freshness: "noLimit"`, `summary: false`, `count: 10`.
- **Response:** Map `data.webPages.value[]` → `{ title, url, snippet }[]`, then **filter to feed-like URLs** (path/query heuristics: `rss`, `atom`, `feed`, `.xml`, `/feeds/`, etc.; drop obvious non-feeds). Dedupe by normalized URL. Soft-fail: missing key → `503` `{ "error": "feed_search_not_configured" }`; upstream failure → `502`.
- **UI:** In **Add a source** for RSS-capable kinds (website / newsletter / podcast / community RSS), add Search → results list → **Add** that calls existing `POST /api/sources` with `adapter: "rss"`, `config.rssUrl`, and **`category` from the current Add Kind tab**. Reuse create/error handling. No change to Social / Community Subreddit / HN paths.
- **Env:** `LANGSEARCH_API_KEY` in `apps/web/.env.example` (+ ops note in `docs/ops-local.md`). Not needed in worker root `.env`.
- **Out of scope v1:** `feedsearch.dev` for bare domains (follow-up); Advisor feed suggestions; catalog curation changes; validating feeds by fetching XML in search (create/ingest already own validation); mobile.
- **Depends on:** Shipped `web-source-discovery` (category + `createSource` path).
- **Verify:** Mock LangSearch HTTP; UI Add with active category; key unset → clear unavailable state.

## D. Mobile client

| ID | Feature | Status | Spec |
|----|---------|--------|------|
| `mobile-feed-topics` | Expo feed + topics (thin sources) | ⬜ | `docs/architecture.md` |

## E. Multi-user and channels

| ID | Feature | Status | Spec |
|----|---------|--------|------|
| `multiuser-harden` | Registration, isolation, rate limits (hosted AI via `ai-cloud-providers`) | ⬜ | `docs/architecture.md` |
| `security-harden` | Auth hardening, API keys, abuse/misuse controls | ⬜ | `docs/architecture.md` |
| `source-bluesky` | Bluesky adapter | ✅ | `docs/architecture.md` |
| `source-podcast` | Podcast RSS adapter + episode cards in feed | ✅ | `docs/architecture.md` |
| `source-reddit` | Reddit adapter (subreddits → ranked feed) | ✅ | `docs/architecture.md` |

Notes for `security-harden`:

- **Goal:** Harden the product against account takeover, credential abuse, and automated misuse of session APIs / future machine clients — without turning the personal app into an enterprise IdP.
- **Authentication:** Review Better Auth setup end-to-end — secret rotation, cookie flags (`Secure`/`HttpOnly`/`SameSite`), CSRF posture for cookie sessions, password policy / lockout or progressive delays, email verification expectations, session revocation (sign-out-all / rotate on password change). Close any open signup/spam paths that don’t belong in a personal or small multi-user deploy (align with `multiuser-harden` registration gates).
- **API keys (machine clients):** Session cookies are fine for the browser; mobile and any CLI/automation need a first-class, **revocable** credential. Spec should cover: create/list/revoke keys in Settings; scoped permissions (e.g. read feed vs mutate topics vs trigger rank); hashed-at-rest storage; last-used metadata; never return the secret after create. Prefer Bearer keys on `/api/*` alongside existing session auth — do not invent a parallel API surface.
- **Misuse / abuse:** Expand beyond today’s ad-hoc per-route limits (chat, Rank latest) to a coherent abuse story: per-user and per-IP rate limits on expensive routes (`/api/feed/rank`, `/api/chat`, auth endpoints, source create); backoff on auth failures; optional global kill-switches/env caps for rank and chat; ensure AI token/article budgets (`ai-token-metering`, `rank-ai-budgets`) cannot be bypassed by spawning accounts or hammering catch-up rank. Log/alert enough to diagnose abuse without storing sensitive payloads.
- **Isolation audit:** Reconfirm every mutating and list endpoint is session-/key-scoped to the caller (topics, sources, feed scores, settings, AI usage) — regression tests for cross-user IDOR.
- **Relation to `multiuser-harden`:** That feature is product multi-tenancy (open registration policy, stronger isolation defaults). Hosted / BYOK model backends are `ai-cloud-providers`. This feature is the **threat/abuse** pass (credentials, keys, rate/misuse). Spec either together or land `security-harden` first if running a semi-public deploy before full multi-user polish.
- **Out of scope v1:** OAuth social login, SSO/SAML, fine-grained admin RBAC consoles, WAF/CDN productization, penetration-test remediation beyond issues found in this pass.

Notes for `source-podcast`:

- **Problem:** Finding good podcasts is hard; Newsroom already ranks text stories by topic — episodes should enter the same ranked feed.
- **Ingest:** New `source_type` `podcast` (or shared RSS path with Substack). Subscribe via podcast RSS/Atom URL; map **episodes** → `NormalizedArticle` (title, summary/description, canonical episode or show URL, publishedAt). Parse common podcast namespaces (enclosure audio URL, duration, show/author) into config or article metadata as needed.
- **Feed UX (v1):** Episode cards show show name, duration when known, and open/play via external link (Apple/Spotify/browser). **No** in-app audio player or transcripts in v1.
- **Ranking:** Same hybrid keyword + AI path; match topics/keywords against show + episode title/description. Source filter includes `podcast`.
- **Discovery:** Manual RSS URL first; extend `GET /api/feed-catalog` (or a podcast catalog) so users can Add show without hunting URLs — align with `web-source-discovery` patterns.
- **Reuse:** Prefer extending `packages/sources` RSS parsing rather than a greenfield fetcher; keep paywall/scrape out of scope (enclosure URL only).
- **Out of scope v1:** Built-in player, offline download, chapter markers, full-text transcript ranking, auto-follow “similar shows.”
- **Depends on:** Existing ingest + feed UI; stronger with catalog discovery. Independent of Bluesky.

Notes for `source-bluesky` (shipped):

- **Subscribe:** `source_type: bluesky`, config `{ handle }` (normalized; optional `did` later). Public AppView only — no Bluesky OAuth/app passwords.
- **Ingest:** `getAuthorFeed` with `filter=posts_no_replies`; skip pure reposts and empty text; upsert on bsky.app post URL.
- **Mobile:** Expo UI deferred to `mobile-feed-topics`.
- **Out of scope v1:** personal timeline, firehose, catalog discovery, embeds/media gallery.

Notes for `source-reddit`:

- **Problem:** Topic niches live heavily on Reddit; Newsroom should rank subreddit posts alongside HN / Substack / podcasts / Bluesky.
- **Subscribe (v1):** `source_type: reddit`, config `{ subreddit }` (normalized name, no `r/` prefix stored; many subs per user). **Subreddits only** — not user profiles, multis, or home/frontpage.
- **Ingest:** Adapter fetches recent posts for that sub (public JSON or Reddit API with a documented User-Agent / optional app credentials via env — decide in spec; no end-user Reddit OAuth in v1). Map posts → `NormalizedArticle` (title, selftext/link URL as summary/canonical, author, publishedAt, `externalId`). Skip removed/deleted/empty-title; prefer link+self posts over pure media-only if text ranking would be empty. Upsert on canonical `reddit.com` / `redd.it` post URL.
- **Feed UX:** Same hybrid keyword + AI path; source filter **Reddit**; Sources UI **Add Reddit** (subreddit name). Display subreddit + author in meta when cheap (reuse existing source label patterns).
- **Discovery v1:** Manual subreddit entry only; curated catalog later (align with `web-source-discovery` follow-ups).
- **Uniqueness:** Same user + same normalized subreddit + `reddit` → `duplicate` (409); partial unique index like Bluesky handle.
- **Mobile:** Expo UI deferred to `mobile-feed-topics`.
- **Out of scope v1:** Comments as feed items, personal home/multi, subreddit search API UI, scraping old.reddit HTML, voting/posting, NSFW gate productization beyond skip-or-config flag if API requires it.
- **Depends on:** Existing ingest + feed UI; independent of Bluesky/podcast. Spec must cover rate limits / blocked anonymous access (Reddit often requires a proper User-Agent and may need script/app credentials for reliable ingest).
- **Risk:** Reddit API policy and rate limits are stricter than HN/Bluesky public AppView — bake env-based credentials + backoff into the handoff, not “anonymous scrape and hope.”
