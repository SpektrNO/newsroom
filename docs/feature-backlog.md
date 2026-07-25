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

## C. Web client

| ID | Feature | Status | Spec |
|----|---------|--------|------|
| `web-feed-topics-sources` | Elegant feed, topics, sources UI | ✅ | `docs/architecture.md` |
| `web-topics-tree` | Topics UX: tree picker, keywords, weight help | ✅ | `docs/architecture.md` |
| `web-topics-catalog` | Browse full topic catalog (not only my topics) | ⬜ | `docs/architecture.md` |

Notes for `web-topics-tree` (shipped):

- Topic **name** comes from a curated hierarchical **topic tree** (selectable leaves only); label stored in existing `topics.name` (no catalog id column).
- **Keywords** are free-text chips/tokens; matching remains **case-insensitive** via ranking keyword pass.
- **Weight** has in-UI help for keyword scoring / hybrid blend (see `docs/decisions/002-hybrid-ranking.md`).
- Thin `GET /api/topic-tree` serves catalog v1; create/patch validate `name` against selectable labels. Mobile can follow later via `mobile-feed-topics`.

Notes for `web-topics-catalog`:

- Today `/topics` mainly lists **topics the signed-in user has registered**. Users should also be able to **browse the full curated catalog** (all selectable leaves / tree), not only their own rows.
- Mark which catalog topics the user already follows; affordance to **add** (follow) one that isn’t registered yet (reuse create flow / defaults for keywords+weight as specified in handoff).
- **Out of scope:** viewing *other users’* personal topic rows or keywords (privacy / multi-user). Catalog = shared curated tree from `GET /api/topic-tree`, not a global dump of `topics` table.
- Primarily `apps/web`; thin API only if a “my followed ids/labels” join is cleaner than client-side merge.

## D. Mobile client

| ID | Feature | Status | Spec |
|----|---------|--------|------|
| `mobile-feed-topics` | Expo feed + topics (thin sources) | ⬜ | `docs/architecture.md` |

## E. Multi-user and channels

| ID | Feature | Status | Spec |
|----|---------|--------|------|
| `multiuser-harden` | Registration, isolation, rate limits, host AI swap | ⬜ | `docs/architecture.md` |
| `source-bluesky` | Bluesky adapter | ⬜ | `docs/architecture.md` |
