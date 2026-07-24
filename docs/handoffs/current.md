# Handoff: scaffold-monorepo

**Status:** done  
**Created:** 2026-07-24  
**Specifier agent:** spec complete  
**Developer agent:** complete

## GitHub tracking

| Field | Value |
|-------|-------|
| Feature id | `scaffold-monorepo` |
| Parent issue | #6 — https://github.com/SpektrNO/newsroom/issues/6 |
| Open tasks | _(none — db #8, api #9, verify #10, docs #11 closed)_ |

Task order: `audit` → `spec` → `db` → `api` → `worker` → `web` → `mobile` → `verify` → `docs`

Phase-1 note: `spec` (#7) closed by specifier. Foundation section has no separate `worker` / `web` / `mobile` GitHub tasks — those apps are still created in this feature (see Touchpoints); track under `db` + `api` as appropriate, then `verify` / `docs`.

## Intent

A developer can clone the repo, bring up Postgres (and optional Ollama) via Compose, run the Turborepo monorepo, sign up / sign in with Better Auth, and confirm `GET /api/health` reports DB + Ollama reachability — without ingest, ranking, or feed UI yet.

## User-facing spec

| Field | Value |
|-------|-------|
| Trigger | Local bootstrap: install deps, `docker compose up`, run web (and optionally worker/mobile stubs). |
| Surfaces | `apps/web` (Next.js App Router + auth + health), `apps/mobile` (Expo Router shell), `apps/worker` (runnable stub), Docker Compose (Postgres + optional Ollama), shared packages. |
| Copy | Minimal auth UI only: email/password sign-up and sign-in forms with clear error text on failure. No marketing landing, feed, topics, or sources screens. App / product name: **Newsroom**. |
| Acceptance | Observable pass/fail criteria below. |

### Acceptance criteria

1. **Monorepo layout** exists and matches architecture:
   - `apps/web` — Next.js (App Router)
   - `apps/mobile` — Expo (Expo Router shell; can start)
   - `apps/worker` — Node entry that starts and exits cleanly or idles without crashing (no ingest jobs required)
   - `packages/db` — Drizzle schema + migrations
   - `packages/ai` — `AiProvider` interface + `OllamaProvider` default
   - `packages/sources` — package stub with adapter contract type(s) only (no live HN/Substack/Bluesky fetch)
   - `packages/api-client` — shared typed client used by web (and importable by mobile)
   - Root Turborepo + workspace package manager wired so `turbo` / workspace scripts build or typecheck the graph
2. **Docker Compose** starts Postgres with a documented `DATABASE_URL`. Optional Ollama service (or documented host-Ollama path via `OLLAMA_HOST`). Compose must not require Ollama to start Postgres.
3. **Env** documented in `.env.example` / README: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `OLLAMA_HOST`, `OLLAMA_MODEL` (align with existing commented placeholders).
4. **Better Auth** email/password works end-to-end against Postgres: register → session cookie/token → authenticated session readable by the web app. User-scoped identity from day one (no anonymous-only mode).
5. **`GET /api/health`** returns JSON including at least:
   - overall / service status
   - database reachability (ok / fail)
   - Ollama reachability (ok / fail) — probe `OLLAMA_HOST`; must not crash the process if Ollama is down (report fail)
6. **`packages/ai`**: `AiProvider` abstraction; `OllamaProvider` implements it. A **smoke test** (unit or script under package/tests) proves the provider can be constructed and, when Ollama is reachable, completes a trivial call; when unreachable, fails gracefully (no unhandled throw that breaks the suite when marked optional / skipped appropriately — document how to run the live smoke).
7. **Migrations** apply cleanly to empty Postgres (`packages/db` migrate command documented).
8. **README** lists install, Compose, migrate, web/worker/mobile run, health check, and AI smoke commands.
9. **Out of scope items** below are absent (no feed API, no ingest adapters calling external sources, no ranking pipeline, no Bluesky).

## API / DB contract (if any)

PostgreSQL-backed; Better Auth for identity. This feature ships **auth + health only** on the HTTP surface. Domain tables for topics/articles/jobs are **deferred** to later features unless Better Auth’s own tables require them (they do not).

### Endpoints

| Field / Endpoint | Type | Source | Notes |
|------------------|------|--------|-------|
| `POST /api/auth/*` | Better Auth handlers | Better Auth | Email/password first. Mount per Better Auth + Next.js App Router conventions. OAuth deferred. |
| `GET /api/health` | JSON | Live probes | Must include DB connectivity and Ollama reachability. Unauthenticated. Stable shape documented in README or a short `docs/` note if non-obvious. Suggested fields: `status` (`ok` \| `degraded` \| `error`), `checks.database` (`ok` \| `error`), `checks.ollama` (`ok` \| `error`), optional `version` / timestamp. `degraded` when app is up but a dependency fails (e.g. Ollama down, DB up). |

### Explicitly not in this feature

| Endpoint | Notes |
|----------|-------|
| `GET/POST/PATCH /api/topics` | Later (`web-feed-topics-sources` / ranking features) |
| `GET/POST/DELETE /api/sources` | Later |
| `GET /api/feed` + feed actions | Later (`hybrid-rank-feed`) |

### Database (Drizzle in `packages/db`)

| Table / concern | Notes |
|-----------------|-------|
| Better Auth tables | Whatever Better Auth + Drizzle adapter require for email/password (e.g. `user`, `session`, `account`, `verification` — follow current Better Auth schema; names may match library defaults). Migrations checked in. |
| Domain tables (`topics`, `source_subscriptions`, `articles`, `article_sources`, `user_article_scores`, `jobs`) | **Out of scope** for this handoff. Do not invent partial stubs that conflict with later features; leave for `ingest-hn-substack` / `hybrid-rank-feed`. |
| Personal-first | Single registered user is a valid production shape; schema remains multi-user-ready via `user.id` on auth tables. |

### Shared packages contracts

| Package | Contract |
|---------|----------|
| `packages/ai` | `AiProvider` interface (e.g. `complete` / `rank`-style method(s) sufficient for a smoke call — keep minimal). `OllamaProvider` reads `OLLAMA_HOST` + `OLLAMA_MODEL`. No UI imports this package for model calls later without going through API/worker — establish that boundary now. |
| `packages/sources` | Export adapter interface matching architecture intent: `fetchRecent() → NormalizedArticle[]` (types + empty/no-op stubs OK). No network I/O to HN/Substack/Bluesky. |
| `packages/api-client` | Typed client with at least `health()` hitting `GET /api/health`. Auth helpers optional if web uses Better Auth client directly; keep package ready for web + mobile. |
| `packages/db` | Schema + migrate + client export used by web (and later worker). |

### Jobs / queue

Postgres-backed job queue is the architecture default for v1, but **job table + worker scheduling are out of scope** here. `apps/worker` is a scaffold entrypoint only.

## Touchpoints

- Create: root workspace (`package.json`, `pnpm-workspace.yaml` or npm/yarn equivalent — prefer **pnpm** if choosing greenfield), `turbo.json`, `docker-compose.yml`, `.env.example` (extend existing), `apps/*`, `packages/*`
- `apps/web`: Next.js App Router, Better Auth route handlers, minimal sign-up/sign-in pages, `GET /api/health`
- `apps/mobile`: Expo Router app shell (tabs optional); must resolve/build; may call health via `api-client`
- `apps/worker`: minimal `main` / start script
- `packages/db`, `packages/ai`, `packages/sources`, `packages/api-client`
- `README.md` — onboarding commands (required for done)
- Optional ADR under `docs/decisions/` only if a non-obvious choice needs recording (e.g. package manager, Better Auth adapter details)
- Must not contradict `docs/architecture.md`

### Suggested task mapping (implementer)

| GitHub task | Focus |
|-------------|--------|
| `db` (#8) | Compose Postgres, `packages/db` + migrations (Better Auth tables), env wiring |
| `api` (#9) | Turborepo apps/packages skeleton, Better Auth on web, health endpoint, `packages/ai` + smoke, `packages/sources` stub, `packages/api-client`, mobile + worker scaffolds |
| `verify` (#10) | Migrations, auth flow, health with/without Ollama, AI smoke as documented |
| `docs` (#11) | README + any short ops note; backlog status left to `record-feature-complete.sh` at feature end |

## Out of scope

- Ingest adapters with live HN / Substack / Bluesky fetching
- Hybrid keyword + Ollama ranking pipeline and `user_article_scores`
- Feed UI (web or mobile), topics UI, sources management UI
- `GET /api/feed` and topic/source CRUD APIs
- Domain Drizzle tables listed in architecture beyond Better Auth
- OAuth / social login
- Redis or non-Postgres queues
- Production deploy / hosting
- Seed of example topics / Substack feeds (architecture “Local development” seed is for later when those tables exist; optional single seed **user** for auth smoke is allowed if documented)

### Open questions / non-conflicts

- None blocking. Architecture seed (topics + Substack) waits until those tables exist in later features.
- Package manager not prescribed in architecture; pick one workspace tool and document it (pnpm recommended).

---

## Implementation result

### Changes

- Root pnpm + Turborepo workspace (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`)
- `docker-compose.yml` — Postgres always; Ollama via `--profile ollama`
- `packages/db` — Better Auth `user`/`session`/`account`/`verification` schema + migration `0000_*`, `pnpm db:migrate`
- `packages/ai` — `AiProvider`, `OllamaProvider`, unit tests + `smoke` script
- `packages/sources` — `SourceAdapter` / `NormalizedArticle` + `StubSourceAdapter`
- `packages/api-client` — `health()` typed client
- `apps/web` — Next.js App Router, Better Auth email/password, `/sign-up` `/sign-in`, `GET /api/health`
- `apps/mobile` — Expo Router shell calling health via api-client
- `apps/worker` — stub entry (exit or idle)
- `scripts/verify-scaffold.sh` — local acceptance smoke
- `README.md` + `docs/ops-local.md` — onboarding and health contract

### Verification

- [x] `pnpm db:migrate` on Compose Postgres
- [x] Better Auth sign-up → session; sign-in → session (curl + `./scripts/verify-scaffold.sh`)
- [x] `GET /api/health` → `degraded` with `database: ok`, `ollama: error` when Ollama down (no crash)
- [x] `pnpm --filter @newsroom/ai test` pass; smoke skips when Ollama unreachable
- [x] `pnpm --filter @newsroom/web build`; worker stub exits; mobile `typecheck`
- [ ] Live Ollama complete() — requires host/Compose Ollama + model pull (`OLLAMA_SMOKE=1 pnpm ai:smoke`)
- [ ] Expo interactive `start` on device/simulator — typecheck only in CI-like verify

### Deviations from spec

- None material. Chose **pnpm** as workspace package manager (recommended in handoff).
- Bumped `drizzle-orm` to `^0.45.2` for Better Auth peer range.
- Health returns HTTP 503 only when both checks fail; single-dep failure stays 200 + `degraded`.

### Follow-ups

- Parent #6 stays open until PR merges (`Closes #6`).
- Next backlog: `ingest-hn-substack`, then ranking/feed UI features.
- Operators should set `BETTER_AUTH_SECRET` ≥ 32 chars in local `.env` / `apps/web/.env.local`.

---

## Handoff summary (for developer)

- Scaffold Turborepo: `apps/{web,mobile,worker}` + `packages/{db,ai,sources,api-client}`; Compose Postgres (+ optional Ollama); document env from `.env.example`.
- Ship Better Auth email/password + Drizzle migrations for auth tables only; personal-first, multi-user-ready via real `user` rows.
- Implement `GET /api/health` with DB + Ollama checks (`degraded` when deps fail); never crash health on Ollama down.
- Add `AiProvider` + `OllamaProvider` and a documented smoke test; `packages/sources` = types/stub only.
- Do **not** build ingest, ranking, feed/topics/sources APIs or UI, or Bluesky — leave domain tables for later features.
