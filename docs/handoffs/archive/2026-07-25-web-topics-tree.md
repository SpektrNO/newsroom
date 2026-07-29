# Handoff: Topics UX — tree picker, keywords, weight help

**Status:** done  
**Created:** 2026-07-25  
**Specifier agent:** spec complete  
**Developer agent:** complete

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `web-topics-tree` |
| Parent issue | #60 — https://github.com/SpektrNO/newsroom/issues/60 |
| Open tasks | *(none — all task sub-issues closed; parent stays open for PR)* |
| Closed tasks | `spec` (#61), `api` (#62), `web` (#63), `verify` (#64), `docs` (#65) |
| Backlog | `docs/feature-backlog.md` § C — Notes for `web-topics-tree` |

Task order for this **web** feature (from parent #60): `spec` → `api` → `web` → `verify` → `docs`  
(No `audit`, `db`, `worker`, or `mobile` slugs.)

## Intent

On the web Topics page, signed-in users pick a topic from a curated hierarchical tree (instead of inventing a free-text name), enter free-text keywords, and understand weight via in-UI help tied to hybrid keyword ranking — while keep create / edit / enable-disable / delete working as today.

## User-facing spec

| Field | Value |
|-------|-------|
| Trigger | Signed-in user opens `/topics` to add or edit topics. |
| Surfaces | **Web** (`apps/web` Topics UI) + **thin API** for the curated topic-tree catalog. Existing `GET/POST/PATCH/DELETE /api/topics*` unchanged in semantics. **No** worker, mobile, or DB schema work. |
| Copy | Exact strings in **Copy** below. |
| Acceptance | See **Acceptance criteria** below. |

### Routes & surfaces

| Route / surface | Auth | Change |
|-----------------|------|--------|
| `/topics` | Session required | Replace free-text **Name** with hierarchical **topic-tree picker**. Keywords → free-text chips/tokens. Weight → control + inline help. Preserve list + CRUD actions. |
| `GET /api/topic-tree` | Session required | **New** thin catalog endpoint (see contract). |
| Feed / Sources / Settings | — | Unchanged. |
| Mobile | — | Out of scope (`mobile-feed-topics` later). |

### Topic name → tree picker

**Problem:** Blank free-text names are clunky and inconsistent.

**Behavior:**

1. **Create:** Primary control is a hierarchical topic-tree picker. User expands categories and selects a **selectable** (leaf) node. There is **no** blank free-text name field on create.
2. **Edit:** Same picker. Pre-select the catalog node whose `label` matches the topic’s stored `name` (case-insensitive). If no match (legacy / seed drift), show the current name as a muted “Current: {name}” note and require the user to pick a tree node before save (or allow save only if they select a node that updates `name`).
3. **Stored value:** Continue storing the selected node’s **`label`** in `topics.name` (existing column + unique `lower(name)` per user). Do **not** add a `catalog_node_id` column (no `db` task).
4. **Display path:** In the form and optionally in the list meta, show breadcrumb path (e.g. `Technology · AI & Machine Learning · AI & infra`) for clarity; list title remains the leaf label.
5. **Duplicates:** Unchanged — selecting a label the user already has → API `409` → copy below.
6. **Non-selectable parents:** Category nodes are for navigation only; only nodes with `selectable: true` can be chosen as the topic name.

### Keywords

1. Free-text entry via **chips / tokens** (preferred) or equivalent tokenizing input. Enter / comma / semicolon / newline create a chip; Backspace removes the last chip when the draft is empty.
2. At least one keyword required when creating or when the topic is/remains enabled (align with existing `invalid_topic` rules).
3. Limits unchanged: ≤ 50 keywords, ≤ 64 chars each after trim; empty tokens dropped.
4. **Matching:** Case-insensitive substring on title/summary — already implemented in `packages/ai` `scoreKeywordMatch`. Do not change ranking code unless a bug blocks case-insensitive behavior. Storage may keep user casing; UI may display as entered.
5. Placeholder: `Add keywords…`

### Weight + help

Keep numeric control (default `1`, clamp `0.1`–`10`, step `0.1`) and add always-visible (or disclosure-default-open) help next to the Weight label.

**Normative help copy** (must appear; wording may wrap for layout but keep meaning):

> **What weight does:** When a keyword from this topic matches an article’s title or summary, that hit adds `weight × 0.25` toward the keyword score (capped at 1). Keyword score is part of hybrid ranking: final rank blends keyword score (35%) with the AI score (65%). See hybrid ranking.
>
> **Higher weight** (e.g. 2–10): matching keywords push this topic’s stories harder toward the shortlist ceiling — use for interests you care about most.
>
> **Lower weight** (e.g. 0.1–0.5): matches still count, but contribute less to keyword score — use for weaker or exploratory interests.

Do **not** show raw formula symbols in the primary help if they hurt scanability; the `weight × 0.25` / 35%–65% language above is enough. Link or footnote “See hybrid ranking” may point to in-app Settings note or omit the link if there is no public docs route — inline text alone satisfies acceptance.

### CRUD preserved

| Action | Behavior |
|--------|----------|
| List | Name (leaf label), optional path crumb, keywords, weight, enabled state, Edit / Disable|Enable / Delete |
| Create | Tree selection + keywords + weight + enabled → `POST /api/topics` |
| Edit | Same fields → `PATCH /api/topics/:id` |
| Enable / Disable | `PATCH` `{ enabled }` only (unchanged) |
| Delete | Confirm then `DELETE /api/topics/:id` |

Empty, loading, and error states stay equivalent to the current Topics page (updated lede copy below).

### Copy

| Context | String |
|---------|--------|
| Page title | `Topics` |
| Page lede | `Pick a topic from the tree, add keywords, and set how strongly matches should rank.` |
| Form heading (create) | `Add topic` |
| Form heading (edit) | `Edit topic` |
| Tree label | `Topic` |
| Tree empty / none selected | `Choose a topic…` |
| Tree search (if implemented) | Placeholder `Search topics…` |
| Legacy unmatched name | `Current name isn’t in the catalog: “{name}”. Pick a topic from the tree.` |
| Keywords label | `Keywords` |
| Keywords placeholder | `Add keywords…` |
| Weight label | `Weight` |
| Weight help | (see **Weight + help** normative copy) |
| Enabled | `Enabled` |
| Submit create | `Add topic` |
| Submit edit | `Save changes` |
| Cancel edit | `Cancel` |
| Pending | `Saving…` |
| Duplicate (`409`) | `You already have a topic with that name.` |
| Validation (`400`) | `Check the topic and keywords.` |
| Generic save failure | `Couldn't save topic — try again.` |
| Load failure | `Couldn't load topics.` |
| Empty list | `No topics yet. Pick one from the tree so ranking knows what you care about.` |
| Delete confirm | `Delete topic "{name}"?` |
| Delete / toggle failure | `Couldn't update topic — try again.` / `Couldn't delete topic — try again.` (keep existing patterns) |
| Disable / Enable buttons | `Disable` / `Enable` |
| Edit / Delete buttons | `Edit` / `Delete` |

### Visual direction

Stay within the shipped web aesthetic (Fraunces + Source Sans 3, teal accent, soft atmosphere from `web-feed-topics-sources`). Topics form may use one restrained panel. Tree picker: expand/collapse hierarchy or combobox-with-tree — not a wall of equal cards. Chips are interaction affordances, not decorative pills clusters. Mobile viewport: tree usable in a single column (full mobile product polish is later).

### Acceptance criteria

1. **Create:** User cannot submit a new topic without selecting a selectable tree node; there is no primary free-text name field on create.
2. **Tree:** Catalog matches the **Curated catalog (v1)** below (ids/labels); parents non-selectable; leaves selectable; UI shows hierarchy (expand/collapse and/or path).
3. **Name persistence:** Selected leaf `label` is sent as `name` on create/patch; list shows that name; duplicate leaf for same user → `409` + duplicate copy.
4. **Keywords:** Chips/tokens (or equivalent); stored as `string[]`; case-insensitive matching still works for ranking (no regression in keyword pass).
5. **Weight:** Control + normative help visible on the form; range still 0.1–10 default 1.
6. **CRUD:** Enable/disable, edit, delete behave as before (session-scoped, confirm on delete).
7. **Legacy:** Topics whose `name` is not in the catalog still list/edit/delete; edit requires choosing a catalog node to update the name (or clear guidance as in Copy).
8. **API:** `GET /api/topic-tree` returns the catalog for a signed-in user; `401` when signed out. Existing topics endpoints keep request/response shapes.
9. **Scope:** No mobile app changes; no Postgres migration; no ranking formula changes unless fixing a documented bug.
10. **Seed:** Seed topic label `AI & infra` remains a selectable leaf in the catalog so demo seed stays coherent.

### Curated catalog (v1)

Static, versioned catalog (repo module). Thin API returns this JSON shape. Implementer may add a small number of extra leaves if needed for UX balance, but **must** include every id/label below.

| id | parentId | label | selectable |
|----|----------|-------|------------|
| `tech` | `null` | Technology | no |
| `tech.ai` | `tech` | AI & Machine Learning | no |
| `tech.ai.infra` | `tech.ai` | AI & infra | **yes** |
| `tech.ai.llms` | `tech.ai` | LLMs & agents | **yes** |
| `tech.ai.mlops` | `tech.ai` | MLOps & data | **yes** |
| `tech.eng` | `tech` | Software Engineering | no |
| `tech.eng.languages` | `tech.eng` | Languages & runtimes | **yes** |
| `tech.eng.databases` | `tech.eng` | Databases & storage | **yes** |
| `tech.eng.devtools` | `tech.eng` | Developer tools | **yes** |
| `tech.security` | `tech` | Security & privacy | **yes** |
| `business` | `null` | Business & Startups | no |
| `business.funding` | `business` | Funding & markets | **yes** |
| `business.product` | `business` | Product & growth | **yes** |
| `science` | `null` | Science | no |
| `science.bio` | `science` | Biology & health | **yes** |
| `science.climate` | `science` | Climate & energy | **yes** |
| `culture` | `null` | Culture & Society | no |
| `culture.design` | `culture` | Design & media | **yes** |
| `culture.policy` | `culture` | Policy & rules | **yes** |

`version`: integer `1`.

## API / DB contract

PostgreSQL-backed topics rows **unchanged**. Better Auth session required for all endpoints below. No new tables / migrations.

### Existing topics API (preserve)

| Endpoint | Notes |
|----------|-------|
| `GET /api/topics` | `{ topics: Topic[] }` — unchanged |
| `POST /api/topics` | Body `{ name, keywords, weight?, enabled? }` — `name` must be a catalog leaf **label** from the client; server may optionally validate against catalog (recommended) and reject unknown names with `400` `invalid_topic` |
| `PATCH /api/topics/:id` | Partial `{ name?, keywords?, weight?, enabled? }` — same optional name validation |
| `DELETE /api/topics/:id` | `204` — unchanged |

Errors unchanged: `401`, `400` `{ error: "invalid_topic" }`, `409` `{ error: "duplicate" }`, `404` `{ error: "not_found" }`.

**Optional server validation (preferred for `api` task):** Shared catalog module imported by the route; on create/patch when `name` is present, require `name` to equal some selectable node’s `label` (case-insensitive). Legacy rows with non-catalog names remain readable until the user patches `name`.

### New: topic tree catalog

| Field / Endpoint | Type | Source | Notes |
|------------------|------|--------|-------|
| `GET /api/topic-tree` | JSON | Static catalog module | Session required. No DB. |
| Response | object | — | `{ version: 1, nodes: TopicTreeNode[] }` |
| `TopicTreeNode` | object | — | `{ id: string, parentId: string \| null, label: string, selectable: boolean }` |
| Auth failure | `401` | Better Auth | Same pattern as other APIs |

**api-client:** Add `listTopicTree(): Promise<TopicTreeResponse>` (and types). Web Topics UI should prefer the client over ad-hoc fetch.

**Architecture note:** `docs/architecture.md` Clients section already plans this Topics refactor. Add `GET /api/topic-tree` to the API surface list in the **docs** task (not required to edit architecture during `api`/`web` unless convenient). Does **not** contradict hybrid ranking ADR — weight help documents existing formula only.

### DB

| Field | Change |
|-------|--------|
| `topics.name` | Still free-form text at the DB layer; product UX constrains values to catalog labels |
| New columns / tables | **None** |

## Touchpoints

- `apps/web/src/components/topics-client.tsx` — tree picker, keyword chips, weight help, copy
- `apps/web/src/app/topics/page.tsx` — only if layout/wrapper needs adjustment
- `apps/web/src/app/api/topic-tree/route.ts` — **new** GET
- Catalog module — e.g. `apps/web/src/lib/topic-tree.ts` and/or `packages/api-client` / small shared module so API + client validation share one list (prefer one shared source of truth under `apps/web` or a tiny shared package path the API can import; avoid duplicating the table)
- Optional: `apps/web/src/lib/topics.ts` — validate create/patch `name` against catalog
- `packages/api-client/src/index.ts` — `listTopicTree` + types
- Tests: extend `apps/web/src/lib/topics.test.ts` / API isolation tests for catalog endpoint + optional name validation; UI smoke if present
- Docs task later: README / architecture API surface / backlog note as needed

Must not contradict `docs/architecture.md` or `docs/decisions/002-hybrid-ranking.md`.

## Out of scope

- Expo / `mobile-feed-topics` UI
- Postgres migrations or storing `catalogNodeId` on topics
- Changing keyword or final-rank formulas
- Multi-select topics in one create, custom user-defined tree nodes, or admin taxonomy CMS
- Renaming existing non-catalog topics automatically in a migration
- Feed filter UX changes (still filters by topic id / name as today)
- Bluesky / other sources work

### Open questions (resolved for implementer)

| Question | Decision |
|----------|----------|
| Server vs client-only catalog? | Thin **`GET /api/topic-tree`** + shared static module (supports later mobile; matches `api` task). |
| Store node id in DB? | **No** — store leaf `label` in `topics.name` only. |
| Custom free-text names on create? | **No** — curated picker only. |
| Validate name on API? | **Yes, recommended** against selectable labels when `name` is sent. |

---

## Implementation result

### Changes

- **api:** `apps/web/src/lib/topic-tree.ts` curated catalog v1; `GET /api/topic-tree` (session); create/patch validate `name` against selectable leaf labels (canonical casing); `packages/api-client` `listTopicTree` + types; unit tests in `topic-tree.test.ts` / `topics.test.ts`.
- **web:** Topics page tree picker (expand/collapse + search), keyword chips, normative weight help, exact handoff copy; list shows optional path crumbs; legacy non-catalog names guided to re-pick.
- **docs:** `docs/architecture.md` API + Clients; `docs/feature-backlog.md` ✅; `README.md` topic-tree endpoint + status.

### Verification

- [x] `npx tsx --test` topics + topic-tree + feed unit tests; `pnpm --filter @newsroom/ai test` (case-insensitive keyword match); web + api-client typecheck
- [ ] Manual: signed-in `/topics` create/edit/enable/delete with tree + chips (UI smoke not automated); Postgres isolation suite needs live DB

### Deviations from spec

- None

### Follow-ups

- Supervisor Phase 3: PR with `Closes #60`
- Optional later: Expo Topics via `mobile-feed-topics` 

---

## Handoff summary

- Replace Topics free-text **name** with a curated hierarchical **tree picker**; store selected leaf **label** in existing `topics.name` (no DB migration).
- **Keywords** stay free-text chips/tokens; ranking match remains case-insensitive; CRUD enable/edit/delete preserved.
- **Weight** keeps 0.1–10 control plus normative in-UI help explaining `weight × 0.25` keyword hits and 35%/65% hybrid blend (ADR 002).
- Thin **`GET /api/topic-tree`** (+ api-client) serves static catalog v1; optional API validation that `name` is a selectable label.
- Out of scope: mobile, schema changes, ranking formula edits; implement `api` → `web` → `verify` → `docs`.
