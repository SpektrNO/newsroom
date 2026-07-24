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
