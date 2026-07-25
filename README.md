# Newsroom

Focused news for topics you care about — Hacker News, Substack, and more — with a simple web UI and Expo mobile apps.

Personal-first; multi-user-ready data model and APIs.

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io) 9 (`corepack enable` recommended)
- Docker (Postgres + Ollama via Compose — `docker compose up -d`; see [docs/ops-local.md](docs/ops-local.md#ollama))
- Optional: host [Ollama](https://ollama.com) only if you want easier **GPU** access — [docs/ops-local.md](docs/ops-local.md#optional-host-install-for-gpu)

## Quick start

```bash
cp .env.example .env
# Set BETTER_AUTH_SECRET to ≥32 characters, e.g. openssl rand -base64 32
# Copy the same app vars into apps/web/.env.local for Next.js

pnpm install
docker compose up -d          # Postgres + Ollama
pnpm db:migrate
pnpm db:seed                  # demo user + HN + Platformer Substack + example topic
# First time: docker exec -it newsroom-ollama ollama pull llama3.2
pnpm --filter @newsroom/web dev
```

Open http://localhost:3000 — sign up / sign in (seeded demo from `pnpm db:seed` if you used the default seed user). Authenticated home is the ranked **Feed**; use **Topics**, **Sources**, and **Settings** in the masthead.

Check health:

```bash
curl -sS http://localhost:3000/api/health | jq
```

One-shot ingest then rank (requires migrate + seed or your own subscriptions/topics):

```bash
pnpm worker:ingest            # upserts articles; enqueues a pending rank job
pnpm worker:rank              # keyword shortlist + Ollama batches → user_article_scores
# or: NEWSROOM_WORKER_ONCE=ingest|rank pnpm --filter @newsroom/worker start
```

After ingest + rank, refresh the Feed on http://localhost:3000 — story rows appear with Save / Dismiss; filter by topic, source, or Saved.

Long-running worker (claims `ingest` and `rank` jobs; ingest cadence ~12 minutes):

```bash
pnpm --filter @newsroom/worker start
```

## Monorepo layout

| Path | Role |
|------|------|
| `apps/web` | Next.js — auth, editorial feed / topics / sources / settings UI, APIs |
| `apps/mobile` | Expo Router shell (health via api-client) |
| `apps/worker` | Postgres job poller + one-shot ingest/rank CLI |
| `packages/db` | Drizzle schema + migrations (auth, ingest, topics, scores) |
| `packages/ai` | `AiProvider` + keyword/`rankArticleBatch` helpers |
| `packages/sources` | HN + Substack adapters (`SourceAdapter`) |
| `packages/api-client` | Typed client (health, sources, topics, feed) |

## Commands

| Command | Description |
|---------|-------------|
| `pnpm install` | Install workspace deps |
| `docker compose up -d` | Start Postgres + Ollama |
| `docker compose up -d postgres` | Postgres only (skip Ollama) |
| `docker exec -it newsroom-ollama ollama pull llama3.2` | Pull ranking model into the Compose Ollama volume |
| `pnpm db:generate` | Generate Drizzle migrations from schema |
| `pnpm db:migrate` | Apply migrations to `DATABASE_URL` |
| `pnpm db:seed` | Demo user + HN + Platformer Substack + `AI & infra` topic |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm --filter @newsroom/web dev` | Next.js dev server (:3000) |
| `pnpm --filter @newsroom/web build` / `start` | Production web build / serve |
| `pnpm --filter @newsroom/worker start` | Long-running ingest + rank job poller |
| `pnpm worker:ingest` / `pnpm --filter @newsroom/worker ingest` | One-shot ingest then exit (enqueues rank) |
| `pnpm worker:rank` / `pnpm --filter @newsroom/worker rank` | One-shot rank then exit |
| `pnpm --filter @newsroom/mobile start` | Expo dev server |
| `pnpm sources:test` | Adapter + URL normalization fixture tests |
| `pnpm worker:test` | Ingest + rank integration tests (needs Postgres; AI mocked) |
| `pnpm web:test` | Topics/feed parsers + session isolation (needs Postgres) |
| `pnpm --filter @newsroom/ai test` | AI unit tests (offline-safe keyword + rank parse) |
| `pnpm --filter @newsroom/ai smoke` | Live Ollama smoke (skips if unreachable; `OLLAMA_SMOKE=1` to require it) |
| `pnpm build` / `pnpm typecheck` | Turbo build / typecheck graph |
| `./scripts/verify-scaffold.sh` | Local acceptance: health + sign-up session (web must be up) |

Env vars: see `.env.example` (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, `OLLAMA_HOST`, `OLLAMA_MODEL`, `EXPO_PUBLIC_API_URL`). Optional: `SEED_USER_ID`, `NEWSROOM_WORKER_ONCE=ingest|rank`, `RANK_BATCH_SIZE` (clamped 20–50, default 30), `OLLAMA_TIMEOUT_MS` (generate timeout, default 300000).

### Topics & feed API (session cookie)

| Method | Path | Notes |
|--------|------|-------|
| `GET/POST` | `/api/topics` | List / create (caller’s topics only) |
| `PATCH/DELETE` | `/api/topics/:id` | Update / delete own topic |
| `GET` | `/api/feed?cursor=&topic=&source=&status=&limit=` | Ranked scores; default excludes `dismissed`; `status=saved` (etc.) filters to that status |
| `POST` | `/api/feed/:articleId/seen\|saved\|dismissed` | Update status; `404` if no score row |

Ranking formulas and job behavior: [docs/decisions/002-hybrid-ranking.md](docs/decisions/002-hybrid-ranking.md). Health, seed, Compose: [docs/ops-local.md](docs/ops-local.md).

## Docs

| Doc | Purpose |
|-----|---------|
| [docs/architecture.md](docs/architecture.md) | System design, data model, APIs |
| [docs/ops-local.md](docs/ops-local.md) | Local Compose / health / ingest / rank; Ollama via Compose (easy) or host (GPU) |
| [docs/decisions/001-ingest-url-and-hn.md](docs/decisions/001-ingest-url-and-hn.md) | Canonical URL + HN Firebase choices |
| [docs/decisions/002-hybrid-ranking.md](docs/decisions/002-hybrid-ranking.md) | Keyword + AI rank formulas and jobs |
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

`scaffold-monorepo`, `ingest-hn-substack`, `hybrid-rank-feed`, and `web-feed-topics-sources` are implemented (auth, sources, ingest, topics/feed APIs, worker rank, editorial web UI). Expo feed UI is next per the backlog.
