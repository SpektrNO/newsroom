# Handoff: Browse full topic catalog (following vs available)

**Status:** implementing  
**Created:** 2026-07-25  
**Specifier agent:** spec complete  
**Developer agent:** in progress

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `web-topics-catalog` |
| Parent issue | #67 — https://github.com/SpektrNO/newsroom/issues/67 |
| Open tasks | `api` (#69), `web` (#70), `verify` (#71), `docs` (#72) |
| Closed tasks | `spec` (#68) |
| Backlog | `docs/feature-backlog.md` § C — Notes for `web-topics-catalog` |

Task order for this **web** feature (from parent #67): `spec` → `api` → `web` → `verify` → `docs`  
(No `audit`, `db`, `worker`, or `mobile` slugs.)

## Intent

Signed-in users can browse the full curated topic catalog on `/topics`, see which leaves they already follow, and follow an available catalog leaf with one click (creating a normal per-user topic via the existing topics API).

## User-facing spec

| Field | Value |
|-------|-------|
| Trigger | Signed-in user opens `/topics` to manage interests or discover catalog topics they do not yet follow. |
| Surfaces | **Web** (`apps/web` Topics UI). **Thin API** only if helpful — prefer client merge of existing endpoints (see contract). **No** worker, mobile, or DB schema work. |
| Copy | Exact strings in **Copy** below. |
| Acceptance | See **Acceptance criteria** below. |

### Routes & surfaces

| Route / surface | Auth | Change |
|-----------------|------|--------|
| `/topics` | Session required | Add a **Catalog** browse surface (full curated tree) alongside the existing **Following** list and Add/Edit form. Distinguish following vs available; affordance to follow an unregistered leaf. |
| `GET /api/topic-tree` | Session required | **Reuse as-is** (catalog v1). |
| `GET/POST/PATCH/DELETE /api/topics*` | Session required | **Reuse as-is** for list + follow create + manage. |
| Feed / Sources / Settings | — | Unchanged. |
| Mobile | — | Out of scope (`mobile-feed-topics` later). |

### Information architecture

Keep a single `/topics` page (no new route). Structure:

1. **Header** — title + updated lede (see Copy).
2. **Add / Edit form** — preserve `web-topics-tree` behavior (tree picker, keyword chips, weight help, CRUD). Still the path for custom keywords/weight when creating from scratch or editing.
3. **Following** — the user’s registered topics list (today’s `manage-list`). Heading clarifies these are topics the user already has.
4. **Catalog** — hierarchical browse of **all** curated nodes from `GET /api/topic-tree` (same v1 catalog as the picker). Selectable leaves show follow state; non-selectable parents are expand/collapse only.

Do **not** replace the Following list with the catalog. Users must still see keywords, weight, enable/disable, edit, and delete for topics they follow.

Optional UX polish (allowed, not required): section tabs or in-page anchors (`Following` / `Catalog`) if the page grows long — default is stacked sections in the order above.

### Following vs available

For each **selectable** catalog leaf:

| State | Condition | UI |
|-------|-----------|-----|
| **Following** | User has a `topics` row whose `name` equals the leaf `label` (**case-insensitive**, same rule as tree picker / API validation) | Show status `Following` (not a second Follow button). Optional: link/button `Manage` that scrolls to / focuses that row in the Following list, or opens Edit for that topic. |
| **Available** | No matching user topic row | Show primary affordance `Follow` (see below). |

Legacy user topics whose `name` is **not** in the catalog remain in the Following list only (existing edit guidance). They do not appear as “Following” badges on catalog leaves.

Matching is **per signed-in user only**. Never load or display other users’ `topics` rows or keywords.

### Follow affordance (create from catalog)

**Primary:** One-click **Follow** on an Available selectable leaf.

Creates via existing `POST /api/topics` with these **normative defaults**:

| Field | Default | Notes |
|-------|---------|-------|
| `name` | Catalog leaf `label` (canonical casing from tree response / shared module) | Must be a selectable label; server already validates. |
| `keywords` | `[label]` — single starter keyword equal to the leaf label | Satisfies ≥1 keyword rule; user refines via Edit afterward. |
| `weight` | `1` | Same default as the Add form. |
| `enabled` | `true` | Ranking picks it up immediately. |

**Behavior:**

1. Disable the Follow control while the request is in flight; show pending copy on that control (`Following…`).
2. On **201**: refresh topics (+ tree if needed); leaf flips to Following; new row appears under Following.
3. On **409** `duplicate`: treat as already following — refresh list/state; do not show a hard error (optional muted note is fine).
4. On **400** / network failure: show `Couldn't follow topic — try again.` (page-level or inline near the leaf).
5. Do **not** open a confirm dialog for Follow.

**Secondary (required):** User can still use **Add topic** form to pick any leaf and set custom keywords/weight (unchanged). After a one-click Follow, **Edit** on the Following row is how they customize keywords/weight.

Do **not** invent a separate “follow” API. Do **not** auto-unfollow from the catalog (unfollow = Delete / Disable on the Following row, unchanged).

### Catalog tree UX

1. Same hierarchy as `GET /api/topic-tree` / shared `topic-tree` module (v1 nodes from shipped `web-topics-tree`).
2. Expand/collapse parents; only `selectable: true` nodes show Follow / Following.
3. Optional search/filter over catalog labels (reuse picker search patterns if easy) — nice-to-have, not required for acceptance.
4. Show breadcrumb or indented hierarchy so depth is clear (match existing tree visual language).
5. Stay within shipped web aesthetic (Fraunces + Source Sans 3, teal accent). Catalog is a tree, not a card grid or dashboard of equal tiles.

### Copy

| Context | String |
|---------|--------|
| Page title | `Topics` |
| Page lede | `Follow topics from the catalog, then tune keywords and weight so ranking knows what you care about.` |
| Form heading (create) | `Add topic` |
| Form heading (edit) | `Edit topic` |
| Following section heading | `Following` |
| Following empty | `You’re not following any topics yet. Browse the catalog below or add one with keywords.` |
| Catalog section heading | `Catalog` |
| Catalog section lede | `Browse all curated topics. Follow one to start ranking for it.` |
| Follow button | `Follow` |
| Follow pending | `Following…` |
| Following status | `Following` |
| Manage (optional) | `Manage` |
| Follow failure | `Couldn't follow topic — try again.` |
| Load failure (topics) | `Couldn't load topics.` |
| Load failure (catalog / tree) | Prefer existing picker fallback (static catalog) so Catalog is never blank; if both fail, `Couldn't load catalog.` |
| Duplicate on Follow | Prefer silent refresh to Following state; if a toast/message is shown: `You’re already following that topic.` |

Preserve existing form / list / CRUD copy from `web-topics-tree` unless superseded above (tree label, keywords, weight help, duplicate on form submit, delete confirm, etc.).

### Visual direction

Same as Topics today: restrained panel for the form; tree for catalog; Following list as existing rows. Clear visual distinction between **Following** (status text / muted check) and **Follow** (action). Avoid pill clusters and card walls.

### Acceptance criteria

1. **Catalog browse:** `/topics` shows the full curated catalog (all selectable leaves reachable via the hierarchy from `GET /api/topic-tree` / shared catalog v1), not only the user’s registered topics.
2. **State:** Each selectable leaf clearly shows **Following** vs **Available** based on the signed-in user’s `topics` rows (case-insensitive `name` ↔ leaf `label`).
3. **Follow:** Available leaf → Follow → `POST /api/topics` with defaults `name=label`, `keywords=[label]`, `weight=1`, `enabled=true`; leaf becomes Following; row appears under Following.
4. **Privacy:** UI and APIs used by this feature never expose other users’ topic rows or keywords.
5. **CRUD preserved:** Following list still supports Edit / Enable|Disable / Delete; Add topic form still works for custom keywords/weight.
6. **No schema / ranking changes:** No Postgres migration; no ranking formula changes; no new catalog id column.
7. **API reuse:** Follow uses existing topics create; catalog data from existing topic-tree. No global dump of the `topics` table.
8. **Auth:** Signed-out users cannot use Topics (unchanged session gate).
9. **Scope:** Web only for this feature; mobile deferred.

## API / DB contract (if any)

PostgreSQL-backed topics **unchanged**. Better Auth session required. **No new tables / migrations.**

### Preferred approach: client-side merge (no new endpoint)

| Endpoint | Role |
|----------|------|
| `GET /api/topic-tree` | Full curated catalog `{ version, nodes[] }` — unchanged |
| `GET /api/topics` | Current user’s topics only — unchanged |
| `POST /api/topics` | Follow / Add create — unchanged body `{ name, keywords, weight?, enabled? }` |
| `PATCH/DELETE /api/topics/:id` | Manage followed topics — unchanged |

Web derives Following vs Available by matching `topics[].name` to selectable `nodes[].label` (case-insensitive).

**`api` task (#69) may be thin:**

- Confirm reuse; add a small shared helper if useful (e.g. `followDefaultsForLabel(label)` → create body, or `isFollowingLabel(topics, label)`).
- Optional `packages/api-client` convenience (not required): e.g. document that `createTopic` is the follow path.
- Regression tests for topic-tree + topic create validation remain green.
- **Do not** add an endpoint that lists other users’ topics or “popular” topics.
- **Do not** require a new route unless the web task hits a real friction; if adding one, only an optional annotation such as extending the existing tree response with a **session-scoped** `followed: boolean` on selectable nodes (still derived from the current user’s rows). Prefer **not** doing this unless client merge proves awkward.

### Errors (unchanged)

| Status | Body | Follow UX |
|--------|------|-----------|
| `401` | — | Session gate / redirect as today |
| `400` | `{ error: "invalid_topic" }` | Follow failure copy |
| `409` | `{ error: "duplicate" }` | Treat as already following |
| `201` | `{ topic }` | Success |

### DB

| Field | Change |
|-------|--------|
| `topics.*` | **None** — follow inserts a normal per-user row |
| New columns / tables | **None** |

## Touchpoints

- `apps/web/src/components/topics-client.tsx` — Catalog section, Following heading, Follow action, copy/lede
- Possibly extract a small `TopicCatalogTree` presentational piece from the existing picker patterns (same nodes, different leaf actions)
- `apps/web/src/lib/topic-tree.ts` — reuse; no catalog content change required for this feature
- `apps/web/src/lib/topics.ts` / tests — only if helpers for follow defaults land here
- `packages/api-client` — only if thin helpers/types are added (no breaking changes)
- `apps/web/src/app/api/topic-tree/route.ts` / topics routes — **unchanged** unless optional followed annotation is explicitly chosen
- Docs task later: backlog status, architecture Clients blurb (“planned” → shipped catalog browse), README if UX commands/docs mention Topics

Must not contradict `docs/architecture.md` or `docs/decisions/002-hybrid-ranking.md`. Architecture already notes planned catalog browse beyond “my topics”.

## Out of scope

- Other users’ personal topic rows / keywords (privacy)
- Social / “popular topics” / cross-user discovery
- Changing ranking, ingest, or keyword formulas
- Postgres migrations or `catalogNodeId` on topics
- Expo / `mobile-feed-topics`
- Admin taxonomy CMS or user-defined catalog nodes
- Unfollow-from-catalog control (use Delete / Disable on Following)
- Feed filter UX changes
- Multi-select follow in one click

### Open questions (resolved for implementer)

| Question | Decision |
|----------|----------|
| New join API vs client merge? | **Client merge** of `listTopics` + `listTopicTree` by default; optional followed annotation only if needed. |
| One-click Follow vs open form? | **One-click Follow** with defaults; Edit / Add form for custom keywords/weight. |
| Default keywords? | **`[leaf label]`** single starter keyword; weight `1`; enabled `true`. |
| Expose other users’ topics? | **Never.** |
| Catalog source? | Existing curated tree (`GET /api/topic-tree` / shared module), **not** a dump of `topics`. |

---

## Implementation result

*(Developer agent fills this section.)*

### Changes

- 

### Verification

- [ ] How tested
- [ ] What remains manual

### Deviations from spec

- None / list with rationale

### Follow-ups

- 

---

## Handoff summary

- Add a **Catalog** browse section on `/topics` (full curated tree from existing `GET /api/topic-tree`) beside the **Following** list; do not drop CRUD or the Add/Edit form.
- Mark each selectable leaf **Following** vs **Available** via case-insensitive match to the signed-in user’s `topics.name` (never other users’ rows).
- **Follow** = one-click `POST /api/topics` with defaults `name=label`, `keywords=[label]`, `weight=1`, `enabled=true`; refine via Edit afterward.
- **API task is thin:** reuse topic-tree + topics CRUD; client-side merge preferred; no schema/ranking changes; no social/popular topics.
- Implement order: `api` (#69) → `web` (#70) → `verify` (#71) → `docs` (#72); parent #67 stays open for the PR.
