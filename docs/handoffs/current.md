# Handoff: introduce-themes

**Status:** spec  
**Created:** 2026-07-30  
**Specifier agent:** spec complete  
**Developer agent:** pending

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `introduce-themes` |
| Parent issue | #158 — https://github.com/SpektrNO/newsroom/issues/158 |
| Open tasks | `api` (#160), `web` (#161), `verify` (#162), `docs` (#163) |
| Closed / Phase-1 | `spec` (#159, this handoff) |
| Implementer note — `api` | **Skip / close #160 as not-applicable.** Persistence is `localStorage` only (no Postgres columns, no `/api/settings/*` appearance endpoints). Close with a short rationale comment when starting Phase 2. Do **not** invent a DB/API unless product revisits under `multiuser-harden`. |

Task order: `audit` → `spec` → `db` → `api` → `worker` → `web` → `mobile` → `verify` → `docs`  
(This feature has no `audit`, `db`, `worker`, or `mobile` tasks.)

## Intent

Signed-in users pick a light page atmosphere and Comfortable vs Compact density in Settings → Appearance; choices apply live via `data-theme` / `data-density` and persist in the browser, while buttons/selects/chips hug their content more tightly.

## User-facing spec

| Field | Value |
|-------|-------|
| Trigger | User opens **Settings** and changes Appearance controls; choices apply immediately across the authenticated shell and survive reload in the same browser. |
| Surfaces | **Web only** — authenticated shell (Feed, Topics, Advisor, Sources, Settings). Shared `globals.css` tokens also affect landing/auth pages’ control sizing (tighten is global); atmosphere presets apply wherever `data-theme` is set on `<html>` (root layout). No worker, API, or Expo work. |
| Copy | See **Copy** below. |
| Acceptance | See **Acceptance criteria** below. |

### Design decisions (locked)

Depends on tokens from `web-elegant-refresh` / ADR [`docs/decisions/003-web-design-tokens.md`](../decisions/003-web-design-tokens.md). Keep `--accent` / `--accent-hover` teal; do **not** invent per-theme brand palettes. Avoid purple gradients, cream+terracotta pairings, and broadsheet hairline layouts.

#### 1. Atmosphere presets (`data-theme`)

Exactly **four** presets. Attribute on `<html>`: `data-theme="<id>"`. Default when missing/invalid: `paper` (today’s look).

| `data-theme` | Label (UI) | Intent | Token overrides (locked enough to implement) |
|---|---|---|---|
| `paper` | Paper | Current default — warm paper + teal/amber washes | Keep today’s `:root` / `body` values as the baseline (`--paper`, `--panel`, `--surface`, `--border`, `--hairline`, body radial + linear gradients). Selecting Paper restores these. |
| `mist` | Mist | Cooler, quieter gray-green atmosphere | Cooler `--paper` / body gradient stops (soft sage–gray); slightly cooler `--surface` / `--panel`; softer amber wash (reduce warm radial opacity or drop it); **unchanged** `--accent`, `--ink`, `--muted`. |
| `slate` | Slate | Neutral cool stone, minimal color wash | Cool gray `--paper` and body gradient; muted/low-chroma radials (teal wash only, no amber); `--surface` near white-cool; **unchanged** accent. |
| `inkwash` | Inkwash | Soft blue-teal tint, still light | Cool blue-teal paper/gradient; keep light overall (not dark mode); accent stays editorial teal. |

Rules:

- Presets **only** retune atmosphere tokens used by `body` background and related soft surfaces: at minimum `--paper`, `--panel`, `--surface`, `--border` / `--hairline` (if needed for contrast), and the `body { background: … }` gradient stops. Prefer CSS like `html[data-theme="mist"] { … }` and `html[data-theme="mist"] body { … }` (or equivalent) rather than duplicating the whole stylesheet.
- **Do not** change `--accent`, `--accent-hover`, `--accent-warm`, `--danger`, fonts, or radius scale per theme.
- **No** color pickers, custom CSS, or user-uploaded backgrounds.
- Swatches in Settings: small clickable samples showing each preset’s background tint (not cards-as-decoration — they are the interaction control). Selected swatch must be obvious (e.g. accent outline / `aria-pressed` / `aria-checked`).

#### 2. Density (`data-density`)

Attribute on `<html>`: `data-density="comfortable" | "compact"`. Default: `comfortable` (current spacing).

| Mode | Behavior |
|---|---|
| `comfortable` | Today’s spacing — no net change vs post–`web-elegant-refresh` layout when density is default. |
| `compact` | Tighter **feed item** vertical padding (`.story-row`), **filter** row gaps (`.feed-filters`, `.feed-view-sort`, topic/source filter gaps), **pipeline / status** row spacing (`.feed-pipeline-row` and related), and modestly tighter list/manage row padding where the same tokens apply. Do **not** shrink type below readable sizes; do **not** hide Rank latest / Wipe. |

Implement density via CSS variables preferred, e.g. `--space-row`, `--space-filter-gap` set under `:root` / `html[data-density="compact"]`, consumed by the rules above — avoid one-off magic numbers scattered without tokens.

Density is **orthogonal** to `data-theme`.

#### 3. Tighten controls (required, same feature)

Always-on improvement (not gated on Compact): chrome that currently oversizes must hug content.

| Target | Change |
|---|---|
| Primary `button` | Reduce default padding from `0.75rem 1rem` toward ~`0.5rem 0.85rem` (exact values implementer-tuned); keep hierarchy from ADR 003. |
| `.ghost` / `.danger-text` / `.linkish` | Already tighter; ensure they stay consistent with any new shared control-height token. |
| Shared `input, select` | Slightly reduce padding (today `0.7rem 0.8rem`); keep chevron reserve on `select`. |
| Feed View / Sort / Sources selects | Ensure `.filter-field` / `.filter-field-view` / `.feed-sort-controls select` **do not** force oversized `min-width` — hug content; search field may stay wider (`.feed-search-field` max-width OK). |
| Chips (`.topic-filter-chip`, keyword chips) | Slightly reduce horizontal/vertical padding so chip rows pack tighter; keep `--radius-sm`. |
| Shared control height | Introduce something like `--control-pad-y` / `--control-pad-x` (or one `--control-height` guidance) in `:root` and use it on buttons/inputs/selects where practical — prefer tokens over one-offs. |

Landing/auth primary CTAs may slim slightly as a consequence of shared `button` rules — acceptable; do not special-case a third button variant.

#### 4. Settings → Appearance

Add a **settings-block** on `/settings` **above** Ranking model (after account/sign-out block is fine; Appearance should be easy to find — prefer immediately after the account block, before Ranking model).

Structure:

1. Heading: **Appearance**
2. Lede (one line): see Copy
3. **Background** — labeled swatch group (fieldset/radiogroup semantics)
4. **Density** — two-option control: Comfortable | Compact (segmented buttons or radio group; not a native `<select>` unless swatches already cover the only visual need — prefer explicit dual control matching the two modes)
5. Persistence note (muted): see Copy

Apply changes **live** (no Save button): updating theme/density updates `data-*` on `<html>` and writes `localStorage` in the same turn.

#### 5. Persistence (v1) — `localStorage` only

| Key | Values | Default |
|---|---|---|
| `newsroom.appearance.theme` | `paper` \| `mist` \| `slate` \| `inkwash` | `paper` |
| `newsroom.appearance.density` | `comfortable` \| `compact` | `comfortable` |

Rationale: simplest v1; no schema/API; clearing site data resets appearance. Cross-device sync is a follow-up under `multiuser-harden` (optional `user` columns later) — **out of scope**.

**FOUC:** Root layout must set attributes before first paint when possible — e.g. a tiny inline `<script>` in `apps/web/src/app/layout.tsx` that reads the two keys and sets `document.documentElement.dataset.theme` / `dataset.density` (with validation against the allowlists). Client Settings UI and any appearance provider must stay in sync with the same keys/allowlists.

Invalid or missing values → defaults (`paper`, `comfortable`).

Appearance is **per browser profile**, not per signed-in user account (document in Settings note). No migration of old keys (none exist).

#### 6. Application surface for attributes

- Prefer `data-theme` and `data-density` on `<html>` (already the SSR root in `layout.tsx`) so CSS selectors are global and masthead/`body` atmosphere can follow.
- Authenticated pages use `AppShell`; Settings client owns the controls; a small shared helper module (e.g. `apps/web/src/lib/appearance.ts`) should own key names, allowlists, `parse`/`apply`/`read`/`write` so layout script logic and React stay aligned (inline script may duplicate the allowlist literals minimally — keep them identical).

### Copy

| Location | String |
|---|---|
| Section heading | `Appearance` |
| Section lede | `Background tint and reading density for this browser.` |
| Background group label | `Background` |
| Preset labels | `Paper`, `Mist`, `Slate`, `Inkwash` |
| Density group label | `Density` |
| Density options | `Comfortable`, `Compact` |
| Persistence note | `Saved on this device only. Clearing site data resets appearance.` |
| Page lede update (Settings header) | Change from `Account and read-only system status.` → `Account, appearance, and read-only system status.` |

Accessibility: swatch buttons need accessible names (the preset labels). Density control needs a group label. Announce selection via `aria-pressed` or proper radio semantics.

### Acceptance criteria

1. **Appearance section** exists on Settings with Background swatches + Density control and the copy above.
2. Choosing a preset sets `data-theme` on `<html>` immediately; page atmosphere (body background / paper tint) visibly changes; teal accent unchanged.
3. Choosing Compact sets `data-density="compact"`; feed story rows, filter gaps, and pipeline row are visibly tighter than Comfortable; Rank latest and Wipe remain visible and usable (no layout jump that clips or covers them).
4. Comfortable matches pre-feature spacing intent (aside from the always-on control tighten in #5).
5. **Tighten controls:** Feed View/Sort/Sources controls and chips/buttons visibly hug content more than before; search may remain wider; no new component library.
6. **Reload persistence:** reload keeps the last theme + density from `localStorage` keys above; invalid stored values fall back to defaults.
7. **FOUC:** hard-reload with a non-default theme stored does not flash the Paper atmosphere for a noticeable beat (inline boot script or equivalent).
8. **Scope:** no dark mode, no API/DB appearance endpoints, no Expo changes, no ranking behavior changes.
9. **`api` task:** implementer closes #160 as N/A with rationale (localStorage-only).
10. **Docs task:** short note in architecture Clients/web (or ADR addendum) that appearance is client-only `data-theme` / `data-density` + localStorage; README only if a user-facing ops note is needed (likely architecture + optional ADR 003 addendum / new thin ADR — implementer chooses one focused doc, not both essays).

## API / DB contract (if any)

**None for v1.** No Postgres fields, no Better Auth hooks, no BFF routes.

| Field / Endpoint | Type | Source | Notes |
|------------------|------|--------|-------|
| — | — | — | Close `api` (#160) as skipped / not-applicable. |

Client contract (not HTTP):

| Storage key | Type | Notes |
|-------------|------|-------|
| `newsroom.appearance.theme` | string enum | `paper` \| `mist` \| `slate` \| `inkwash` |
| `newsroom.appearance.density` | string enum | `comfortable` \| `compact` |

DOM:

| Attribute | On | Values |
|-----------|-----|--------|
| `data-theme` | `<html>` | same as theme enum |
| `data-density` | `<html>` | same as density enum |

## Touchpoints

- `apps/web/src/app/globals.css` — theme overrides, density tokens, control padding tighten
- `apps/web/src/app/layout.tsx` — FOUC boot script; ensure `<html>` can receive `data-*`
- `apps/web/src/components/settings-client.tsx` — Appearance block
- `apps/web/src/lib/appearance.ts` (new, suggested) — keys, parse, apply, storage
- Possibly tiny test for parse/allowlist helpers (`appearance.test.ts`)
- `docs/architecture.md` (Clients / web paragraph) and/or `docs/decisions/` — document client-only appearance
- Must not contradict `docs/architecture.md` ranking/API model; this is presentation-only
- **Must not** change feed ranking, wipe, or settings rank-model API

## Out of scope

- Full dark mode / high-contrast a11y theme pack
- Custom CSS, color pickers, wallpapers, per-route themes
- Persisting appearance on `user` / syncing across devices (`multiuser-harden` follow-up)
- Mobile / Expo
- New component libraries (Radix themes, Tailwind theme plugins, etc.)
- Changing brand accent per preset
- Worker / ingest / rank behavior

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

- **Settings → Appearance:** four light atmospheres (`paper` / `mist` / `slate` / `inkwash`) + Comfortable/Compact density; live apply via `data-theme` / `data-density` on `<html>`.
- **Persist v1:** `localStorage` keys `newsroom.appearance.theme` / `newsroom.appearance.density` only; FOUC boot script in root layout; **close `api` (#160) as N/A**.
- **Tighten chrome:** reduce default button/input/select/chip padding and oversized filter `min-width`s (token-first); search may stay wider.
- **Keep teal accent + ADR 003 button/radius rules;** presets only retune paper/surface/gradient atmosphere.
- **Verify:** switch presets + density, reload keeps choice, controls tighter on Feed filters, Rank latest / Wipe stay usable; then docs note client-only appearance.
