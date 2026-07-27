# Decision: web design tokens and control hierarchy

**Date:** 2026-07-28  
**Feature:** `web-elegant-refresh`

## Context

`apps/web/src/app/globals.css` is a single hand-written stylesheet with no design system behind it. It had drifted:

- **Three** competing button treatments — the bare `button` fill, `.ghost`, and a one-off `.catalog-follow` pill — plus `.danger-text` only ever used stacked on `.ghost`, and `.linkish` sharing `.ghost`'s rule. A new control had no obvious idiom to copy.
- Six distinct hardcoded `border-radius` values (`2px`, `0.35rem`, `6px`, `8px`, `10px`, `12px`, `14px`, `18px`) with no relationship to each other.
- `--surface` referenced by `.feed-search-field input[type="search"]` but never defined in `:root`, silently falling back to the CSS default `#fff` while every other input used a hardcoded `#fffefb`.
- Native `<select>` rendering with the browser default arrow next to custom-styled `<input>`s.
- Classes in JSX with zero CSS rules (`.feed-page`, `.chat-page`) and a class with rules missing (`.manage-main`).

The product direction (`docs/feature-backlog.md` § C) asked for a more considered editorial feel without new dependencies, behavior changes, or a broad color system.

## Decisions

1. **Two button variants, two auxiliary idioms.** Primary is the bare `button` element (solid `--accent`); secondary is `.ghost` (transparent fill, `1px solid var(--border)`, `--accent` text). Exactly one primary per view or row. The two auxiliary idioms are `.danger-text` — standalone, borderless, `var(--danger)`, never combined with `.ghost` — and `.linkish`, reserved for the masthead Sign out because it sits inline with plain text rather than in a button group. `.catalog-follow` was deleted; catalog Follow is now a plain primary. `.feed-rank-btn` and `.topic-filter-link` remain size modifiers on `.ghost`, not new variants.

2. **Three-step radius scale.** `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 18px`. Every `border-radius` in `globals.css` references one. Chips, keyword chips, chat bubbles, tree rows, skeletons and the feed search field take `sm`; inputs, selects, buttons (primary and `.ghost`), panels-soft, pickers and catalog panels take `md`; the auth `.panel` takes `lg`. `.ghost` deliberately matches primary at `md` rather than dropping to `sm`, because the two sit side by side in the same action rows.

3. **Native `<select>`, restyled.** `appearance: none` plus an inline data-URI chevron as `background-image`, with `padding-right` reserving space for it. Border, radius and focus ring are inherited from the shared `input, select` rule so selects and inputs are indistinguishable.

4. **Chips.** `.topic-filter-chip` is a neutral outline at rest and a soft teal at rest+active: `background: color-mix(in srgb, var(--accent) 12%, transparent)` with a 45%-accent border. The previous active state mixed `--ink`, which read as "disabled" rather than "on".

5. **One warm accent, one use.** `--accent-warm: #b45309` — the amber already present in the body gradient, not a new hue. It is applied *only* to the feed status bar's `needsRank` state (left border plus stat values). Anything wanting a semantic color beyond this needs its own decision record.

## Alternatives considered

- **A headless select/listbox component** (Radix, Headless UI) for the chevron and menu styling. Rejected: a new runtime dependency and an accessibility surface to own, for what is a background-image and one `appearance` declaration.
- **Tailwind or CSS Modules** instead of tokens in one global sheet. Rejected as out of proportion — the sheet is ~1.2k lines and the problem was inconsistency, not scale. Tokens fix the inconsistency without a migration.
- **Keeping `.catalog-follow` as a third "tertiary" variant.** Rejected: it existed only because catalog rows wanted a smaller Follow button, which is a sizing concern, not a hierarchy one. Three variants is what caused the drift.
- **A full semantic palette** (`--info`, `--warning`, `--success`). Rejected: only one state in the product currently needs non-teal emphasis. Adding four tokens with one consumer invites arbitrary use.
- **`--radius-md: 10px`** to keep existing button/input geometry byte-identical. Rejected: `10px`/`12px`/`14px` were three names for the same intent, and collapsing them onto `12px` is the point of the scale.

## Consequences

- Radii shift slightly where the old value was off-scale: `.button-link` and `.topic-picker-trigger` 10px → 12px, `.panel-soft` 14px → 12px, chips 2px → 8px, chat bubbles ~5.6px → 8px. This includes landing and auth pages, which share `globals.css` — visual only, no markup in those routes changed.
- `.ghost` now draws a border, so `.ghost` buttons occupy ~2px more in each axis. Rows that previously packed borderless ghosts (feed story actions, manage rows) read as denser button groups.
- `--surface` is defined, so `var(--surface, #fff)` fallbacks are gone; changing the input background is now a one-line token change.
- New UI must pick primary or `.ghost`. Anything that needs a third weight should change this record rather than add a class.
- Dark mode remains unimplemented; when it lands, `--surface`, `--accent-warm` and the radius scale are the override points.
