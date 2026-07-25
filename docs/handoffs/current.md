# Handoff: In-app AI advisor chat for topic/keyword advice

**Status:** done  
**Created:** 2026-07-26  
**Specifier agent:** lean (supervisor)  
**Developer agent:** complete (lean)

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `web-ai-advisor-chat` |
| Parent issue | #74 — https://github.com/SpektrNO/newsroom/issues/74 |
| Open tasks | *(none)* |
| Closed tasks | `api` (#76), `web` (#77), `verify` (#78), `docs` (#79) |
| Backlog | `docs/feature-backlog.md` § C — Notes for `web-ai-advisor-chat` |

Task order for this **web** feature: `api` → `web` → `verify` → `docs`  
(No `audit`/`spec`/`db`/`worker`/`mobile` sub-issues created.)

## Intent

Signed-in users chat with Newsroom’s AI about interests and get actionable topic/keyword suggestions they can Follow or apply with confirmation.

## User-facing spec

| Field | Value |
|-------|-------|
| Trigger | User opens `/chat` (nav **Advisor**) for topic/keyword guidance. |
| Surfaces | Web `/chat`; `POST /api/chat`; `packages/ai` advisor helper. No worker/mobile/DB schema. |
| Copy | See **Copy** below. |
| Acceptance | See **Acceptance criteria**. |

### Decisions (lean)

| Topic | Decision |
|-------|----------|
| Surface | Dedicated `/chat` page + masthead **Advisor** |
| Transcript | Ephemeral in the browser; request sends last ≤12 messages |
| Persistence | No Postgres chat table in v1 |
| Non-catalog labels | Show in prose/chips as **advice only** (no Follow); Follow only when label matches a selectable catalog leaf (case-insensitive) |
| Streaming | Not in v1 (single JSON response) |
| Rate limit | 10 messages / user / rolling 60s (in-process); `429` `{ "error": "rate_limited" }` |
| Provider down | `503` `{ "error": "ai_unavailable" }` |

### API

`POST /api/chat` (session required)

**Request**

```json
{
  "messages": [
    { "role": "user" | "assistant", "content": "…" }
  ]
}
```

- Max 12 messages; each content ≤ 2000 chars; last message must be `user`.
- Server loads catalog selectable labels + caller’s Following (name, keywords) and calls `adviseTopics` via `AiProvider` (never from browser).

**Response `200`**

```json
{
  "reply": "prose…",
  "suggestions": [
    {
      "topicLabel": "LLMs & agents",
      "keywords": ["llm", "agent"],
      "rationale": "…",
      "inCatalog": true
    }
  ]
}
```

- `inCatalog` computed server-side from selectable labels (ignore model inventing names for Follow).
- Keywords normalized: trim, drop empty, ≤50, ≤64 chars; prefer short tokens.

**Errors:** `401`, `400` `invalid_chat`, `429` `rate_limited`, `503` `ai_unavailable`

### packages/ai

- `adviseTopics(provider, input)` — system + JSON prompt separate from rank.
- Context: catalog labels (optionally with light path crumbs), following topics, message window.
- Instruct: names should be catalog leaves when possible; keywords substring-friendly; synonyms/related in-scope for advice.
- Parse JSON `{ reply, suggestions[] }`; soft-fail empty suggestions on parse issues if `reply` recoverable.

### Web UI

- Message list + composer; show assistant `reply` and suggestion cards.
- **Follow** (only `inCatalog` && not already following): confirm → `POST /api/topics` with `name=canonicalLabel`, `keywords` from suggestion (fallback starter tokens), `weight=1`.
- **Add keywords** (if already following that label): confirm → `PATCH` merge unique keywords.
- Soft empty / error states; never call Ollama from client.

### Copy

| Key | String |
|-----|--------|
| Nav | `Advisor` |
| Title | `Advisor` |
| Lede | `Ask for topic and keyword ideas. Suggestions stay yours until you follow or apply them.` |
| Placeholder | `What are you interested in?` |
| Send | `Send` |
| Follow | `Follow` |
| Add keywords | `Add keywords` |
| Confirm follow | `Follow “{label}” with these keywords?` |
| Confirm keywords | `Add these keywords to “{label}”?` |
| Rate limited | `Too many messages — wait a minute and try again.` |
| AI down | `Advisor is unavailable right now. Check Settings / Ollama, then retry.` |
| Empty | `Describe your interests to get catalog topics and matchable keywords.` |

### Acceptance criteria

1. Signed-in `/chat` works; signed-out redirects to sign-in.
2. UI never imports/calls Ollama; only `POST /api/chat`.
3. Successful chat returns prose + zero-or-more suggestions; catalog matches offer Follow/Add keywords with confirm.
4. Non-catalog suggestion labels are not Follow-able.
5. Rate limit returns mapped error copy; provider failure soft-fails.
6. Privacy: only session user’s Following in the prompt context.
7. Tests cover advisor parse + chat body validation (and/or API isolation smoke).

### Out of scope

- Streaming; article Q&A; auto-mutate without confirm; multi-user chat; mobile; `rank-ai-budgets` shared quotas; hosted provider swap (`multiuser-harden`).

## Implementation result

### Delivered

- `packages/ai`: `adviseTopics` / `parseAdvisorResponse` (JSON advisor separate from rank).
- `POST /api/chat`: session auth, rate limit, catalog + Following context, `inCatalog` on suggestions.
- `packages/api-client`: `postChat` + chat types.
- Web `/chat` Advisor UI with Follow / Add keywords (confirm); masthead **Advisor**.
- Tests: advisor parse, chat body validation, catalog flags, rate limit.

### Verification

- `pnpm --filter @newsroom/ai test`
- `pnpm --filter @newsroom/web exec node --import tsx --test src/lib/chat.test.ts`
- `pnpm --filter @newsroom/web typecheck`

### Deviations

- No separate GitHub `spec` sub-issue (create script emitted api/web/verify/docs only); lean thin handoff covers spec.
- In-process rate limit (single Node) — fine for local/single instance; multi-instance needs shared store later (`multiuser-harden`).

### Follow-ups

- Streaming responses; shared AI budgets with ranking; mobile chat.
