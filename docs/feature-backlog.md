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
| `web-topics-tree` | Topics UX: tree picker, keywords, weight help | ⬜ | `docs/architecture.md` |

Notes for `web-topics-tree`:

- Replace free-text topic **name** with a selectable **topic tree** (curated hierarchy); avoid inventing names in a blank field.
- **Keywords** stay free-text chips/tokens; matching remains **case-insensitive** (align with ranking keyword pass).
- **Weight** needs in-UI explanation: what it does in keyword scoring / feed priority, and the effect of setting it high vs low (see `docs/decisions/002-hybrid-ranking.md`).
- Scope is primarily `apps/web` Topics page (+ thin API only if the tree catalog needs a server source). Mobile can follow later via `mobile-feed-topics`.

## D. Mobile client

| ID | Feature | Status | Spec |
|----|---------|--------|------|
| `mobile-feed-topics` | Expo feed + topics (thin sources) | ⬜ | `docs/architecture.md` |

## E. Multi-user and channels

| ID | Feature | Status | Spec |
|----|---------|--------|------|
| `multiuser-harden` | Registration, isolation, rate limits, host AI swap | ⬜ | `docs/architecture.md` |
| `source-bluesky` | Bluesky adapter | ⬜ | `docs/architecture.md` |
