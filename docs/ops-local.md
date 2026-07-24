# Local ops notes

## Compose

```bash
docker compose up -d postgres
```

Default `DATABASE_URL`:

```text
postgres://newsroom:newsroom@localhost:5432/newsroom
```

Optional Ollama container (profile; not required for Postgres):

```bash
docker compose --profile ollama up -d
```

Prefer host Ollama: leave the profile off and set `OLLAMA_HOST=http://localhost:11434`.

## Health (`GET /api/health`)

Unauthenticated JSON:

```json
{
  "status": "ok" | "degraded" | "error",
  "checks": {
    "database": "ok" | "error",
    "ollama": "ok" | "error"
  },
  "timestamp": "<ISO-8601>"
}
```

| `status` | Meaning |
|----------|---------|
| `ok` | DB and Ollama both reachable |
| `degraded` | App up; at least one dependency failed (HTTP 200) |
| `error` | Both DB and Ollama failed (HTTP 503) |

Ollama down must not crash the process — report `checks.ollama: "error"`.

## AI smoke

```bash
pnpm --filter @newsroom/ai test          # always offline-safe
pnpm --filter @newsroom/ai smoke         # skips if Ollama unreachable
OLLAMA_SMOKE=1 pnpm --filter @newsroom/ai smoke   # fail if unreachable
```

## Ingest (HN + Substack) and rank

```bash
pnpm db:migrate
pnpm db:seed                 # demo@localhost + HN + Platformer RSS + "AI & infra" topic
# Or: SEED_USER_ID=<better-auth-user-id> pnpm db:seed

pnpm worker:ingest           # one-shot ingest; enqueues pending rank (does not wait on Ollama)
pnpm worker:rank             # one-shot keyword + AI rank → user_article_scores
pnpm --filter @newsroom/worker start   # poll Postgres jobs (ingest ~12 min + rank)

pnpm sources:test            # mocked adapter fixtures
pnpm worker:test             # ingest + rank (mocked AI) + real Postgres
pnpm web:test                # topics/feed parsers + session isolation
pnpm --filter @newsroom/ai test   # keyword formula + rank JSON parse (no live Ollama)
```

- HN: Firebase `topstories`/`newstories` + item hydrate, ≤100 per fetch (see [001](./decisions/001-ingest-url-and-hn.md)).
- Ranking formulas / batch size: [002](./decisions/002-hybrid-ranking.md). Optional `RANK_BATCH_SIZE` (20–50, default 30).
- Sources API (session cookie): `GET/POST /api/sources`, `PATCH/DELETE /api/sources/:id`.
- Topics / feed API: `GET/POST /api/topics`, `PATCH/DELETE /api/topics/:id`, `GET /api/feed`, `POST /api/feed/:articleId/seen|saved|dismissed`.
- Jobs: `type=ingest` and `type=rank`; successful ingest enqueues rank if none open.
