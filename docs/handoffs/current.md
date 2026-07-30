# Handoff: {{title}}

**Status:** spec | implementing | done | blocked  
**Created:** {{date}}  
**Specifier agent:** spec complete  
**Developer agent:** pending

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `{{feature_id}}` |
| Parent issue | #{{parent_number}} — {{parent_url}} |
| Open tasks | `spec`, `db`, … (update as closed) |

Task order: `audit` → `spec` → `db` → `api` → `worker` → `web` → `mobile` → `verify` → `docs`

## Intent

One sentence: what the user should be able to do or see.

## User-facing spec

| Field | Value |
|-------|-------|
| Trigger | When does this activate? |
| Surfaces | web / mobile / worker / API |
| Copy | Exact UI strings (if any) |
| Acceptance | Observable pass/fail criteria |

## API / DB contract (if any)

Fields and endpoints the feature must expose. PostgreSQL-backed; Better Auth for identity.

| Field / Endpoint | Type | Source | Notes |
|------------------|------|--------|-------|
| e.g. `GET /api/feed` | cursor page | scored articles | |

## Touchpoints

- Files, packages, or routes likely to change (best guess; dev agent confirms)
- Must not contradict `docs/architecture.md`

## Out of scope

What this handoff explicitly does **not** include.

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
