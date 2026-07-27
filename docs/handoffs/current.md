# Handoff: web-elegant-refresh

**Status:** done
**Created:** 2026-07-28
**Specifier agent:** spec complete
**Developer agent:** implementation complete

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `web-elegant-refresh` |
| Parent issue | #150 — https://github.com/SpektrNO/newsroom/issues/150 |
| Open tasks | None — all task sub-issues closed. Parent #150 stays open until the PR merges (`Closes #150`). |
| Closed tasks | `spec` (#151, this handoff) · `api` (#152, N/A — design-only pass, no API/contract changes) · `web` (#153, commit `6931fdd`) · `verify` (#154, no code fixes needed) · `docs` (#155) |

Task order: `audit` → `spec` → `db` → `api` → `worker` → `web` → `mobile` → `verify` → `docs`

## Intent

Make the existing editorial web client feel more considered — clearer button/select/chip hierarchy, one restrained warm accent, fixed token gaps, and no orphan CSS — without changing any behavior, API, or DB.

## User-facing spec

| Field | Value |
|-------|-------|
| Trigger | Page load / normal navigation — this is a passive visual and structural change, not a user-triggered action. No new interaction flows. |
| Surfaces | Web only, all authenticated surfaces: Feed (`feed-client.tsx`), masthead/app-shell (`app-shell.tsx`), Topics (`topics-client.tsx`), Sources (`sources-client.tsx`), Advisor/chat (`chat-client.tsx`), Settings (`settings-client.tsx`), `globals.css`. |
| Copy | See **Copy changes** below. |
| Acceptance | See **Acceptance criteria** below. |

### Design decisions (locked — from `docs/feature-backlog.md` § C, do not re-litigate substance)

These are already-decided product/design calls. This section restates them precisely and resolves the mechanical details (exact classes, exact files, exact call on every ambiguous case) so the `web` implementer does not have to guess.

**1. Buttons — exactly two variants + one text idiom**

| Variant | CSS | Used for |
|---|---|---|
| **Primary** | Existing bare `button` rule (solid `--accent` fill, `#f8fffe` text) — no extra class | One main action per view/row: `Follow` (topic catalog + chat suggestion), `Add feed` / `Add podcast` / `Add Hacker News` submit, `Save changes`, `Send`, `Sign out` (Settings), `Save` (feed story actions), `Try again` |
| **Secondary/ghost** | `.ghost` (and its size modifiers `.feed-rank-btn`, `.topic-filter-link`) — restyle to add a real outline: `border: 1px solid var(--border)` (or a slightly stronger `color-mix` border), matching input/button radius token, transparent fill, `--accent` text | Everything else: `Rank latest`, `Wipe rankings`, `Cancel`, `Restore`, `Remove from saved`, `Dismiss`, `Load more`, `Clear filters`, `All` (topic filter), `Enable`/`Disable`, `Add Hacker News`, `Add keywords` |
| **Plain danger-text** | New standalone `.danger-text` rule (not combined with `.ghost` anymore): transparent background, **no border**, `color: var(--danger)`, same padding/font-weight as `.ghost` | `Delete` (topic), `Delete` (source) |

Mechanical changes required:

- Remove `.catalog-follow` entirely (CSS + its one usage in `topics-client.tsx` line ~202: drop `className="catalog-follow"` so the button falls back to bare primary).
- `feed-client.tsx`: `Save` buttons (all three call sites — dismissed/saved/feed views) currently have `className="ghost"` → remove the class so they become primary. `Restore` (dismissed view) currently has **no** class (defaults to primary) → add `className="ghost"` so it becomes secondary. Net effect: within the dismissed-view row, `Restore` = secondary, `Save` = primary; elsewhere `Save` = primary, `Dismiss`/`Remove from saved` = secondary (unchanged).
- `topics-client.tsx` line ~762 and `sources-client.tsx` line ~287: change `className="ghost danger-text"` → `className="danger-text"` (drop `.ghost`, rely on the new standalone rule).
- `.linkish` (masthead "Sign out" in `app-shell.tsx` only) currently shares its CSS rule with `.ghost` (`button.ghost, .linkish { ... }`). **Split them**: keep `.linkish` as today's plain, borderless, inline text-link treatment (it sits next to plain text in the masthead, not in a button group) and let `.ghost` alone gain the new outline. `.linkish` is inline chrome, not counted among the "two button variants."
- After these changes, exactly two button-hierarchy classes should be in active use in JSX: (no class) = primary, `.ghost` = secondary — plus the two auxiliary idioms `.danger-text` (plain destructive text) and `.linkish` (masthead-only inline text link, unchanged from today).

**2. Selects — restyle native `<select>`, no new dependency**

- Apply to the existing `select` CSS rule (shared by all `<select>` elements: Feed Source filter, Feed View filter, Sources topic-tag filter): `appearance: none` (+ `-webkit-appearance: none`), a custom chevron (inline SVG/background-image or a wrapping `::after`), and match the border/radius/focus-ring already used on `input`. No JS, no new package.
- No JSX changes needed — this is a CSS-only rule update to the existing shared `input, select { ... }` block (may need to split into two rules if the chevron requires `select`-only background/padding).

**3. Chips — round `.topic-filter-chip`**

- Change `.topic-filter-chip` `border-radius` from `2px` to the new small radius token (see Tokens below).
- Active state (`.topic-filter-chip.on`): replace the current `color-mix(in srgb, var(--ink) ...)` fill/border with a soft **teal** treatment, e.g. `background: color-mix(in srgb, var(--accent) 12%, transparent); border-color: color-mix(in srgb, var(--accent) 45%, var(--hairline)); color: var(--ink);`
- Inactive state stays neutral outline (current `border: 1px solid var(--hairline)` look), just with the new radius.

**4. Color accents — `--accent-warm`**

- Add `--accent-warm: #b45309;` to `:root` (this is the existing amber already used in the body gradient at `rgba(180, 83, 9, 0.12)` — reuse the same hue, do not invent a new color).
- Use sparingly for "needs rank" / unread emphasis: the feed status bar's `needsRank` state (see #5) and nowhere else in v1. No broader semantic color system, no new tokens beyond this one.

**5. Feed pipeline row → compact status bar**

- Replace the current single `<p className="feed-pipeline">` inline string (`ranked/evaluated/articles · Ingested … · Ranked …`) with a labeled stat cluster — e.g. three short `<span>`/`<dl>` groups each with a small label (`Ranked`, `Evaluated`, `Articles`) above/before their value, plus the two timestamp spans (`Ingested …`, `Ranked …`), instead of the current bare slash-separated numbers relying on a `title` tooltip for meaning.
- Right-align `Rank latest` and `Wipe rankings` as a visually paired action group (e.g. wrap both in a shared `<div className="feed-actions">` with `display: flex; gap: 0.4rem` pinned to the row's end via `margin-left: auto` on the wrapper, or `justify-content: space-between` on the row).
- When `needsRank` is true, apply `--accent-warm` to the stat cluster (e.g. a left border, dot, or the "Ranked" value color) so it visibly signals "stale — rank latest to refresh." Do not use warm accent when `needsRank` is false.
- This only touches `feed-client.tsx` JSX structure (`feed-pipeline-row` and its children) and the corresponding CSS block (`.feed-pipeline*`, `.feed-rank-btn`) — no data/prop changes; `rankedCount`, `evaluatedCount`, `articlesCount`, `lastIngestAt`, `lastRankedAt`, `needsRank` are all already available in this component today.

**6. Topics weight help — summary + `<details>`**

- Replace the always-visible `WEIGHT_HELP` JSX block (3 paragraphs) in `topics-client.tsx` with:
  1. A short 1–2 line summary always visible (see exact copy below).
  2. A native `<details><summary>How weight scoring works</summary>…</details>` wrapping the existing fuller explanation (the current 3 paragraphs, reused verbatim as the disclosure body — no copy loss, just progressive disclosure).
- No new JS dependency (`<details>` is native HTML).

**7. Empty feed state — user-facing copy**

- In `feed-client.tsx`, the "Your feed is quiet" empty state (no active filters) currently reads: *"Add topics and sources, then let ingest and ranking run. Seeded demos: try Topics and Sources after `pnpm db:seed` and `pnpm worker:ingest` / `pnpm worker:rank`."*
- Replace with user-facing guidance (exact copy below); keep the existing `Topics` / `Sources` links (`feed-state-ctas`) as-is — no change needed there beyond removing the CLI paragraph above them.

**8. Tokens**

- Fix the bug: define `--surface` in `:root` (referenced today at `globals.css` line 361 in `.feed-search-field input[type="search"]` but never defined, silently falling back to its `#fff` default). Set `--surface: #fffefb;` — this matches the existing hardcoded input background (`input, select { background: #fffefb; }`) so defining it is a no-op visually but fixes the missing-token bug; then also swap the hardcoded `#fffefb` in the base `input, select` rule to `var(--surface)` for consistency.
- Add a 3-step radius scale to `:root`:
  - `--radius-sm: 8px;`
  - `--radius-md: 12px;`
  - `--radius-lg: 18px;`
- Mechanical find-and-replace mapping (existing hardcoded `border-radius` values → token), covering every rule in `globals.css`:

  | Current value | Rule(s) | → Token |
  |---|---|---|
  | `8px` | `.feed-search-field input[type="search"]`, `.catalog-follow` (being removed, see Buttons), `.keyword-chip` | `--radius-sm` |
  | `6px` | `.skeleton-lines span`, `.topic-tree-branch`/`.topic-tree-leaf`, `.catalog-row-managing` | `--radius-sm` |
  | `2px` | `.topic-filter-chip` (see Chips — rounding up into the scale, not down) | `--radius-sm` |
  | `10px` | `.button-link`, `input`/`select`, bare `button`, `.topic-picker-trigger`, `.keyword-chips-box`, `.topics-filter-toggle` | `--radius-md` |
  | `12px` | `.topic-tree-panel`, `.topic-catalog` | `--radius-md` |
  | `14px` | `.panel-soft` | `--radius-md` |
  | `18px` | `.panel` | `--radius-lg` |
  | `0.35rem` (~5.6px) | `.chat-bubble` | `--radius-sm` |

  `.ghost`/`.danger-text`/`.linkish` currently have no explicit radius (transparent buttons) — when `.ghost` gains a border (see Buttons), give it `border-radius: var(--radius-sm)` to match input sizing at that smaller scale (ghost buttons are usually inline-sized, closer to chip/input scale than the larger `--radius-md` used by primary buttons... **note for implementer**: primary `button` moves to `--radius-md` per the table above, so decide whether `.ghost` should match `--radius-md` (visual consistency with primary in the same row, e.g. Rank latest / Wipe rankings / Save / Dismiss sit beside `--radius-md` primaries) — **use `--radius-md` for `.ghost` to match its primary counterpart**, not `--radius-sm`.

**9. Orphan CSS classes — explicit per-class decision**

| Class | Where used | Decision |
|---|---|---|
| `.feed-page` | `feed-client.tsx` root `<section>` (sole usage, zero CSS rules) | **Remove from JSX.** Children (`.feed-pipeline-row`, `.feed-filters`, `.story-list`, `.feed-state`) already carry their own entrance animations and spacing; the parent `.app-main` already constrains width/padding. Change `<section className="feed-page">` → `<section>`. |
| `.chat-page` | `chat-client.tsx` root `<section className="manage-page chat-page">` (zero CSS rules) | **Remove from JSX.** `.manage-page` alone already matches the pattern used by `topics-client.tsx`, `sources-client.tsx`, `settings-client.tsx` (all three use bare `className="manage-page"`). Change to `className="manage-page"`. |
| `.manage-main` | `sources-client.tsx`, two call sites (wraps title/meta inside `.manage-row`, sibling to `.manage-actions`) | **Give it real rules.** It is the direct structural analog of `.story-main` in the feed list, which has `flex: 1 1 16rem; min-width: 0;` — `.manage-main` currently has no flex-basis so long titles/meta can crowd `.manage-actions` in a flex row without wrapping predictably. Add the same rule: `.manage-main { flex: 1 1 16rem; min-width: 0; }`. |

**10. Docs**

- Add `docs/decisions/003-web-design-tokens.md` (verified next available ADR number — `docs/decisions/` currently has `001-ingest-url-and-hn.md`, `001-pnpm-turborepo.md`, `002-hybrid-ranking.md`) capturing: the two-button-variant rule + danger-text/linkish exceptions, the radius token scale + mapping table, the native-select restyle approach, the chip active/inactive treatment, and the `--accent-warm` usage rule (needs-rank only, no broader palette). This is the source of truth for future UI work — it should read as a decision record (context / decision / alternatives considered / consequences), not a restatement of this handoff.

### Copy changes (exact strings)

| Location | Old | New |
|---|---|---|
| Feed empty state body (`feed-client.tsx`, no-filters branch) | "Add topics and sources, then let ingest and ranking run. Seeded demos: try Topics and Sources after `pnpm db:seed` and `pnpm worker:ingest` / `pnpm worker:rank`." | "Follow a topic and add a source to get started." (keep the existing `Topics` / `Sources` links below unchanged) |
| Topics weight help summary (new, always visible, replaces the always-visible 3-paragraph block) | *(n/a — new)* | "Weight controls how much this topic's keyword matches push stories up your feed. Higher weight ranks matches higher; lower weight lets them count for less." |
| Topics weight help disclosure summary label | *(n/a — new)* | "How weight scoring works" (the `<summary>` text; the 3 existing paragraphs become the `<details>` body, unchanged verbatim) |

### Acceptance criteria (observable, checkable)

1. Exactly one button CSS rule renders as solid/filled (primary) and exactly one renders as outlined/transparent (secondary/`.ghost`) across all six in-scope components; `grep` for `catalog-follow` in `apps/web/src` returns zero JSX usages and zero CSS rules.
2. `.danger-text` never appears combined with `.ghost` in JSX (`grep -rn "ghost danger-text" apps/web/src` returns nothing); it renders borderless with `color: var(--danger)`.
3. `.linkish` (masthead Sign out) visually keeps its current plain/no-border/inline-text look — unaffected by the `.ghost` outline change.
4. Every `<select>` in Feed (Source, View) and Sources (topic-tag filter) is visually indistinguishable in border/radius/focus-ring from adjacent `<input>` elements, and shows a custom chevron (not the browser-default arrow).
5. `.topic-filter-chip` border-radius matches `--radius-sm`; `.on` (active) chips show a visibly teal-tinted fill/border, inactive chips show a neutral outline only.
6. `--accent-warm` is defined in `:root` and is the only new color token added; it is applied only to the feed status bar's `needsRank`-true state and nowhere else.
7. The feed pipeline area shows labeled stat values (not just bare slash-separated numbers) and `Rank latest` / `Wipe rankings` render as a visually grouped, right-aligned pair.
8. The Topics weight field shows a short 1–2 line summary by default, with a native `<details>` the user can expand for the full explanation; no JS library added.
9. The empty (no-filters) feed state shows user-facing copy with no developer/CLI strings (`pnpm`, `worker:ingest`, `worker:rank` do not appear in feed-client.tsx JSX text nodes) and still links to `/topics` and `/sources`.
10. `--surface` is defined in `:root` and every existing reference to `var(--surface, ...)` resolves to that token (no more relying on the CSS fallback value).
11. `--radius-sm`, `--radius-md`, `--radius-lg` are defined in `:root`; every `border-radius` in `globals.css` that previously used a raw px/rem value covered by the mapping table now references one of these tokens.
12. `grep -rn "feed-page\|chat-page" apps/web/src` returns no matches (both removed from JSX and CSS had no rules to remove); `.manage-main` has a non-empty CSS rule and no longer relies on default flex sizing.
13. `docs/decisions/003-web-design-tokens.md` exists and documents the button/radius/select/chip/warm-accent conventions above.
14. No behavior, API request/response shape, route, or DB schema changes anywhere in the diff — verified by `git diff` touching only files in **Touchpoints** below plus the new ADR.
15. Landing/sign-in/sign-up pages, the Expo mobile app, and dark mode are untouched (no diff in those paths).

## API / DB contract

None — visual/structural only. No new endpoints, request/response fields, database tables/columns, or auth changes. `api` task (#152) was already closed by the supervisor as not-applicable for this reason.

## Touchpoints

- `apps/web/src/app/globals.css` (tokens, button/select/chip rules, radius scale, `--surface` fix)
- `apps/web/src/components/feed-client.tsx` (status bar restructure, button class changes, empty-state copy, `.feed-page` removal)
- `apps/web/src/components/app-shell.tsx` (`.linkish`/`.ghost` CSS split only — no JSX change expected here)
- `apps/web/src/components/topics-client.tsx` (weight-help disclosure, `.catalog-follow` removal, `danger-text` class fix)
- `apps/web/src/components/sources-client.tsx` (`.manage-main` layout, `danger-text` class fix)
- `apps/web/src/components/chat-client.tsx` (`.chat-page` removal)
- `apps/web/src/components/settings-client.tsx` (no change expected beyond shared token/radius effects; confirm during implementation)
- `docs/decisions/003-web-design-tokens.md` (new)

Must not contradict `docs/architecture.md`.

## Out of scope

- Landing, sign-in, sign-up pages.
- Mobile (Expo app).
- Any new UI dependency or framework.
- Dark mode.
- Any behavior, API, or DB change (enforced by acceptance criterion 14).
- Any color beyond `--accent-warm` (no broader color system).

---

## Implementation result

### Changes

**`apps/web/src/app/globals.css`**

- `:root`: added `--accent-warm: #b45309`, `--surface: #fffefb`, `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 18px`.
- Tokenized all 18 `border-radius` declarations per the mapping table; no raw px/rem radius values remain in the file.
- `input, select`: `background: #fffefb` → `var(--surface)`; radius → `--radius-md`. New `select`-only rule adds `appearance: none` / `-webkit-appearance: none`, `padding-right: 2.1rem`, and an inline data-URI chevron (`background-image` + `no-repeat` + `right 0.75rem center`). Focus ring and border stay shared with `input`.
- Split `button.ghost, .linkish` into two rules. `.ghost` gains `border: 1px solid var(--border)` and `border-radius: var(--radius-md)`; its hover strengthens the border toward accent. `.linkish` keeps today's borderless inline-text treatment verbatim.
- `button.danger-text` is now standalone: transparent background, `border: 0`, `.ghost`'s padding/font-weight, `color: var(--danger)`, plus an explicit hover so it no longer inherits the primary `button:hover` fill once `.ghost` is off it.
- Removed `.catalog-follow`, `.catalog-follow:hover:not(:disabled)`, `.catalog-follow:disabled`.
- Removed the orphaned `.feed-pipeline` rule; replaced with `.feed-stats`, `.feed-stats.needs-rank`, `.feed-stat-group`, `.feed-stat`, `.feed-stat dt`, `.feed-stat dd`, `.feed-stats.needs-rank .feed-stat dd`, `.feed-stat-times`, `.feed-actions`. `.feed-pipeline-row` and `.feed-pipeline-sep` kept.
- `.topic-filter-chip`: radius `2px` → `--radius-sm`; `.on` swapped from an `--ink` mix to `color-mix(in srgb, var(--accent) 12%, transparent)` fill with a 45%-accent border. Inactive state unchanged apart from radius.
- Added `.manage-main { flex: 1 1 16rem; min-width: 0; }` (mirrors `.story-main`).
- Added `.weight-help summary` and `.weight-help details p` so the disclosure keeps the block's spacing and reads as clickable.

**`apps/web/src/components/feed-client.tsx`**

- `<section className="feed-page">` → `<section>`.
- Pipeline row rebuilt: the single `<p className="feed-pipeline">` becomes a `.feed-stats` container holding a `<dl className="feed-stat-group">` with three labeled `Ranked` / `Evaluated` / `Articles` stats (each `title` carries the meaning the old combined tooltip held) and a `.feed-stat-times` span with the unchanged `Ingested …` / `Ranked …` timestamps. `needsRank` toggles `.needs-rank` on the container. `Rank latest` and `Wipe rankings` moved into `<div className="feed-actions">` (right-aligned via `margin-left: auto`). No prop, state, or data changes.
- Button hierarchy: `Save` (dismissed view and feed view) dropped `className="ghost"` → primary; `Restore` gained `className="ghost"` → secondary. `Dismiss`, `Remove from saved`, `Clear filters`, `Load more`, `All` unchanged as `.ghost`; `Try again` unchanged as primary.
- Empty (no-filters) state body replaced with "Follow a topic and add a source to get started."; `Topics` / `Sources` links untouched.

**`apps/web/src/components/topics-client.tsx`**

- Follow button: dropped `className="catalog-follow"` → bare primary.
- Delete button: `className="ghost danger-text"` → `className="danger-text"`.
- Weight help: always-visible summary paragraph added, with the existing three-paragraph `WEIGHT_HELP` block moved verbatim into `<details><summary>How weight scoring works</summary>…</details>`. No copy lost, no JS added.

**`apps/web/src/components/sources-client.tsx`**

- Delete button: `className="ghost danger-text"` → `className="danger-text"`.

**`apps/web/src/components/chat-client.tsx`**

- `className="manage-page chat-page"` → `className="manage-page"`.

**`apps/web/src/components/app-shell.tsx`** — no change, as the handoff anticipated. The `.linkish` / `.ghost` split is entirely in CSS.

**`apps/web/src/components/settings-client.tsx`** — confirmed no change needed. Its only controls are the primary `Sign out` button and read-only lists; it picks up the shared token changes automatically.

**`docs/decisions/003-web-design-tokens.md`** — new ADR (context / decisions / alternatives considered / consequences).

### Verification

Automated (all run against the final tree):

- [x] `pnpm --filter @newsroom/web typecheck` — pass.
- [x] `pnpm --filter @newsroom/web build` — pass, 10/10 static pages generated. Next's build also runs its own lint + type-validity step.
- [ ] `pnpm --filter @newsroom/web lint` — **cannot run.** The repo has no ESLint config anywhere, so `next lint` drops into an interactive setup prompt and exits 1. Pre-existing and unchanged by this diff; see Follow-ups.
- [x] AC1 — `grep -rn "catalog-follow" apps/web/src` returns only `.catalog-following-status` (an unrelated class); zero `.catalog-follow` rules and zero JSX usages.
- [x] AC2 — `grep -rn "ghost danger-text" apps/web/src` returns nothing.
- [x] AC6 — `--accent-warm` defined in `:root`, referenced only by `.feed-stats.needs-rank` and `.feed-stats.needs-rank .feed-stat dd`.
- [x] AC9 — `grep -n "pnpm\|worker:ingest\|worker:rank" feed-client.tsx` returns nothing; `/topics` and `/sources` links still present.
- [x] AC10 — `--surface` defined; both consumers use bare `var(--surface)` with no fallback.
- [x] AC11 — all three radius tokens defined; all 18 `border-radius` declarations in `globals.css` reference one.
- [x] AC12 — `grep -rn "feed-page\|chat-page" apps/web/src` returns nothing; `.manage-main` has a non-empty rule.
- [x] AC13 — `docs/decisions/003-web-design-tokens.md` exists.
- [x] AC14 / AC15 — `git diff` touches only the five files in Touchpoints plus the new ADR and this handoff. No landing / sign-in / sign-up / mobile / dark-mode paths, no route, API, or schema files.
- [x] No orphan classes introduced — every new class (`feed-stats`, `feed-stat-group`, `feed-stat`, `feed-stat-times`, `feed-actions`, `needs-rank`, `manage-main`) has both a CSS rule and a JSX usage.

What remains manual (no browser or screenshot tooling was available to this agent — a human should click through these):

- [ ] Load **Feed** and confirm the status bar reads as three labeled stats (`Ranked` / `Evaluated` / `Articles`) with the two timestamps beside them, and that `Rank latest` + `Wipe rankings` sit as a right-aligned pair at the end of the row.
- [ ] Trigger the **`needsRank` = true** state (ingest new articles without ranking, or wipe rankings) and confirm the warm amber left border and amber stat values appear — then rank and confirm they disappear.
- [ ] Narrow the browser to ~500px and confirm the status bar and its action pair wrap sensibly instead of overflowing.
- [ ] Toggle a **topic filter chip** and confirm the active state is a soft teal fill/border (not grey), with rounded 8px corners, and that inactive chips stay a neutral outline.
- [ ] Open the Feed **Source** and **View** selects and the Sources **Topic tag** select: confirm each shows the custom chevron (not the browser-default arrow), that the border/radius match the adjacent Search input, and that the focus ring matches on keyboard tab.
- [ ] On Feed, compare a story row's `Save` (should be solid teal) against `Dismiss` (should be outlined). In **Dismissed** view confirm the inverse pairing: `Restore` outlined, `Save` solid.
- [ ] On **Topics** and **Sources**, confirm `Delete` renders as plain red text with no border or box, and that hovering it does not turn it teal.
- [ ] On **Topics**, confirm the catalog `Follow` button now renders as a standard primary button (it is visibly larger than the old pill) and that following a topic still works end to end.
- [ ] On **Topics**, open a topic's Manage panel: confirm the one-paragraph weight summary is visible by default and that "How weight scoring works" expands to the original three paragraphs with correct spacing.
- [ ] In the **masthead**, confirm `Sign out` still looks like plain inline text with no border — it must *not* have picked up the new `.ghost` outline.
- [ ] With no topics/sources and no filters, confirm the empty Feed reads "Follow a topic and add a source to get started." with the Topics · Sources links below.
- [ ] Spot-check **landing**, **sign-in**, and **sign-up**: they share `globals.css`, so confirm the slightly larger radii on `.button-link` and `.panel-soft` look intentional and nothing else shifted.

### Deviations from spec

- **None substantive.** One wording ambiguity was resolved from the spec's own text: Buttons §1 says the `Save` buttons have "all three call sites — dismissed/saved/feed views", but there are only two `Save` buttons in `feed-client.tsx`; the saved view's button reads `Remove from saved`, which the variant table and the same bullet's closing sentence both assign to `.ghost`/secondary. Implemented per the table: `Save` ×2 → primary, `Remove from saved` → unchanged `.ghost`.
- Two small additions the spec left unstated but that its own changes required: an explicit `button.danger-text:hover` (without it, removing `.ghost` lets the primary `button:hover` teal fill leak onto Delete), and `.weight-help summary` / `.weight-help details p` rules (without them the disclosure body loses the block's paragraph spacing, since `.weight-help p { margin: 0 }`).

### Follow-ups

- **`pnpm --filter @newsroom/web lint` is a dead command.** There is no ESLint config in the repo, so `next lint` prompts interactively and fails. `next lint` is also deprecated and removed in Next.js 16. Worth a small feature to add a flat `eslint.config.mjs` with `eslint-config-next` and switch the script to the ESLint CLI — deliberately not done here, since it adds a dependency and touches files outside this handoff's scope.
