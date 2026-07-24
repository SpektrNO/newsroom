# Newsroom

Focused news for topics you care about — Hacker News, Substack, and more — with a simple web UI and Expo mobile apps.

Personal-first; multi-user-ready data model and APIs.

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io) 9 (`corepack enable` recommended)
- Docker (Postgres; optional Ollama Compose profile)
- Optional: [Ollama](https://ollama.com) on the host (`OLLAMA_HOST`)

## Quick start

```bash
cp .env.example .env
# Set BETTER_AUTH_SECRET to ≥32 characters, e.g. openssl rand -base64 32
# Copy the same app vars into apps/web/.env.local for Next.js

pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed                  # demo user + HN + example Substack subscription
pnpm --filter @newsroom/web dev
```

Open http://localhost:3000 — sign up / sign in, then check health:

```bash
curl -sS http://localhost:3000/api/health | jq
```

One-shot ingest (requires migrate + seed or your own subscriptions):

```bash
pnpm worker:ingest
# or: NEWSROOM_WORKER_ONCE=ingest pnpm --filter @newsroom/worker start
```

Long-running worker (claims `ingest` jobs ~every 12 minutes):

```bash
pnpm --filter @newsroom/worker start
```

## Monorepo layout

| Path | Role |
|------|------|
| `apps/web` | Next.js — auth, health, `/api/sources` |
| `apps/mobile` | Expo Router shell (health via api-client) |
| `apps/worker` | Postgres job poller + one-shot ingest CLI |
| `packages/db` | Drizzle schema + migrations (auth + ingest tables) |
| `packages/ai` | `AiProvider` + `OllamaProvider` |
| `packages/sources` | HN + Substack adapters (`SourceAdapter`) |
| `packages/api-client` | Typed client (`health()`, sources CRUD) |

## Commands

| Command | Description |
|---------|-------------|
| `pnpm install` | Install workspace deps |
| `docker compose up -d postgres` | Start Postgres (`DATABASE_URL` in `.env.example`) |
| `docker compose --profile ollama up -d` | Optional Ollama container (Postgres does not depend on it) |
| `pnpm db:generate` | Generate Drizzle migrations from schema |
| `pnpm db:migrate` | Apply migrations to `DATABASE_URL` |
| `pnpm db:seed` | Ensure demo user + enabled HN + Platformer Substack RSS |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm --filter @newsroom/web dev` | Next.js dev server (:3000) |
| `pnpm --filter @newsroom/web build` / `start` | Production web build / serve |
| `pnpm --filter @newsroom/worker start` | Long-running ingest job poller |
| `pnpm worker:ingest` / `pnpm --filter @newsroom/worker ingest` | One-shot ingest then exit |
| `pnpm --filter @newsroom/mobile start` | Expo dev server |
| `pnpm sources:test` | Adapter + URL normalization fixture tests |
| `pnpm worker:test` | Ingest upsert integration test (needs Postgres) |
| `pnpm --filter @newsroom/ai test` | AI unit tests (offline-safe) |
| `pnpm --filter @newsroom/ai smoke` | Live Ollama smoke (skips if unreachable; `OLLAMA_SMOKE=1` to require it) |
| `pnpm build` / `pnpm typecheck` | Turbo build / typecheck graph |
| `./scripts/verify-scaffold.sh` | Local acceptance: health + sign-up session (web must be up) |

Env vars: see `.env.example` (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, `OLLAMA_HOST`, `OLLAMA_MODEL`, `EXPO_PUBLIC_API_URL`). Optional: `SEED_USER_ID` (attach seed subscriptions to an existing Better Auth user), `NEWSROOM_WORKER_ONCE=ingest`.

Health, ingest seed notes, and Compose: [docs/ops-local.md](docs/ops-local.md). Ingest URL/HN choices: [docs/decisions/001-ingest-url-and-hn.md](docs/decisions/001-ingest-url-and-hn.md).

## Docs

| Doc | Purpose |
|-----|---------|
| [docs/architecture.md](docs/architecture.md) | System design, data model, APIs |
| [docs/ops-local.md](docs/ops-local.md) | Local Compose / health / ingest ops |
| [docs/decisions/001-ingest-url-and-hn.md](docs/decisions/001-ingest-url-and-hn.md) | Canonical URL + HN Firebase choices |
| [docs/feature-backlog.md](docs/feature-backlog.md) | Feature segmentation index |
| [docs/feature-completed.md](docs/feature-completed.md) | Shipped registry |
| [docs/github-workflow.md](docs/github-workflow.md) | Issues, handoffs, scripts |

## Spec → implement pipeline

1. **Specifier** (`.cursor/agents/specifier.md`) → `docs/handoffs/current.md`
2. **Developer** (`.cursor/agents/developer-implementer.md`) → implements + records

```text
/spec-and-implement <feature-id> — full
/spec-only <feature-id>
/lean-implement <feature-id>
/implement-handoff
```

See [docs/github-workflow.md](docs/github-workflow.md).

```bash
./scripts/load-feature-issue.sh <feature-id>
./scripts/github-issue-status.sh in-progress <task#> <parent#>
./scripts/create-feature-issues.sh --dry-run
./scripts/record-feature-complete.sh <feature-id>
```

## Status

`scaffold-monorepo` and `ingest-hn-substack` are implemented (auth, sources API, HN/Substack ingest). Ranking and feed UI are next per the backlog.
