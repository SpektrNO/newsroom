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

## Ingest (HN + Substack)

```bash
pnpm db:migrate
pnpm db:seed                 # demo@localhost + HN + https://www.platformer.news/feed
# Or: SEED_USER_ID=<better-auth-user-id> pnpm db:seed

pnpm worker:ingest           # one-shot: claim/run ingest, exit
pnpm --filter @newsroom/worker start   # poll Postgres jobs (~12 min cadence)

pnpm sources:test            # mocked adapter fixtures
pnpm worker:test             # mocked HTTP + real Postgres upsert
```

- HN: Firebase `topstories`/`newstories` + item hydrate, ≤100 per fetch (see [001](./decisions/001-ingest-url-and-hn.md)).
- Sources API (session cookie): `GET/POST /api/sources`, `PATCH/DELETE /api/sources/:id`.
- Jobs table: `type=ingest` only in this feature; worker does not process `rank`.
