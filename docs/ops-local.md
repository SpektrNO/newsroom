# Local ops notes

## Compose

```bash
docker compose up -d          # Postgres + Ollama
docker compose up -d postgres # Postgres only
```

Default `DATABASE_URL`:

```text
postgres://newsroom:newsroom@localhost:5432/newsroom
```

Ollama listens on `http://localhost:11434` (`OLLAMA_HOST`). First time, pull the ranking model:

```bash
docker exec -it newsroom-ollama ollama pull llama3.2
```

Install Ollama on the **host** only if you want easier GPU access — see [Ollama](#ollama). Do not run host and Compose Ollama at the same time (both use port `11434`).

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
pnpm db:seed                 # demo@example.com / newsroom-demo + HN + Platformer RSS + "AI & infra" topic
# Or: SEED_USER_ID=<better-auth-user-id> pnpm db:seed
# Then ingest + rank so that user gets feed rows:

pnpm worker:ingest           # one-shot ingest; enqueues pending rank (does not wait on Ollama)
pnpm worker:rank             # one-shot keyword + AI rank → user_article_scores
# Or: Feed UI → Rank latest (current user only; requires Ollama)
pnpm --filter @newsroom/worker start   # poll Postgres jobs (ingest ~12 min + rank)

pnpm sources:test            # mocked adapter fixtures
pnpm worker:test             # ingest + rank (mocked AI) + real Postgres
pnpm web:test                # topics/feed parsers + session isolation
pnpm --filter @newsroom/ai test   # keyword formula + rank JSON parse (no live Ollama)
```

- HN: Firebase `topstories`/`newstories` + item hydrate, ≤100 per fetch (see [001](./decisions/001-ingest-url-and-hn.md)).
- Ranking formulas / batch size: [002](./decisions/002-hybrid-ranking.md). Optional `RANK_BATCH_SIZE` (20–50, default 30). Generate calls use `OLLAMA_TIMEOUT_MS` (default **5 minutes**) — the old 10s cap was too short for CPU ranking batches.
- Sources API (session cookie): `GET/POST /api/sources`, `PATCH/DELETE /api/sources/:id`.
- Topics / feed API: `GET/POST /api/topics`, `PATCH/DELETE /api/topics/:id`, `GET /api/feed`, `POST /api/feed/:articleId/seen|saved|dismissed`.
- Jobs: `type=ingest` and `type=rank`; successful ingest enqueues rank if none open.

---

## Ollama

Newsroom talks to Ollama over HTTP (`OLLAMA_HOST`, default `http://localhost:11434`). Which process serves that port is up to you.

| Approach | When to use |
|----------|-------------|
| **Docker Compose (recommended)** | Default — `docker compose up -d` starts Postgres and Ollama together |
| **Host install (Linux)** | Optional — mainly to use the machine’s **GPU** more easily than with the stock Compose service |

Both expose the same API. App env does not change. Do **not** run both at once on port `11434`.

Newsroom defaults (see `.env.example`):

| Variable | Default |
|----------|---------|
| `OLLAMA_HOST` | `http://localhost:11434` |
| `OLLAMA_MODEL` | `llama3.2` |

Without Ollama: auth, ingest, topics, and keyword-only ranking still work; health is `degraded` (`checks.ollama: "error"`). AI scores, AI “why” reasons, and near-dup hints are missing until a model is reachable.

### Recommended: Docker Compose

```bash
docker compose up -d
docker exec -it newsroom-ollama ollama pull llama3.2   # or your OLLAMA_MODEL
```

Postgres-only (no Ollama container):

```bash
docker compose up -d postgres
```

Models live in the Compose volume `newsroom_ollama_data` (separate from a host `~/.ollama` install).

Smoke and rank:

```bash
curl -s http://localhost:11434/api/tags | head
pnpm --filter @newsroom/ai smoke
OLLAMA_SMOKE=1 pnpm --filter @newsroom/ai smoke
pnpm worker:rank
```

The Compose service as checked in is typically **CPU-only** (no GPU device passthrough). That is fine for light ranking; switch to a host install (below) when you want GPU acceleration without extending Compose.

### Optional: host install for GPU

Install and run Ollama on the host when you want native GPU drivers (CUDA/ROCm) without configuring Compose device mounts. Stop Compose Ollama first:

```bash
docker compose stop ollama
# or: docker stop newsroom-ollama
```

The rest of this subsection is a local snapshot of [Ollama on Linux](https://docs.ollama.com/linux) so you are not dependent on upstream docs staying available.

#### Install (script)

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

#### Manual install (amd64)

If upgrading from a prior version, remove old libraries first:

```bash
sudo rm -rf /usr/lib/ollama
```

Download and extract:

```bash
curl -fsSL https://ollama.com/download/ollama-linux-amd64.tar.zst \
  | sudo tar x -C /usr
```

Start the server:

```bash
ollama serve
```

In another terminal, verify:

```bash
ollama -v
```

##### AMD GPU (ROCm package)

Also extract the ROCm package:

```bash
curl -fsSL https://ollama.com/download/ollama-linux-amd64-rocm.tar.zst \
  | sudo tar x -C /usr
```

Optional: install ROCm drivers from AMD’s Linux driver docs, then verify GPU tooling as needed.

##### ARM64

```bash
curl -fsSL https://ollama.com/download/ollama-linux-arm64.tar.zst \
  | sudo tar x -C /usr
```

##### NVIDIA CUDA (optional)

Install CUDA drivers from NVIDIA’s download site, then verify:

```bash
nvidia-smi
```

#### systemd service (recommended for always-on host)

Create user and group:

```bash
sudo useradd -r -s /bin/false -U -m -d /usr/share/ollama ollama
sudo usermod -a -G ollama "$(whoami)"
```

Create `/etc/systemd/system/ollama.service`:

```ini
[Unit]
Description=Ollama Service
After=network-online.target

[Service]
ExecStart=/usr/bin/ollama serve
User=ollama
Group=ollama
Restart=always
RestartSec=3
Environment="PATH=$PATH"

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ollama
sudo systemctl start ollama
sudo systemctl status ollama
```

Customize env (e.g. debug):

```bash
sudo systemctl edit ollama
```

Or create `/etc/systemd/system/ollama.service.d/override.conf`:

```ini
[Service]
Environment="OLLAMA_DEBUG=1"
```

Logs:

```bash
journalctl -e -u ollama
```

#### Pull model and smoke-test (host)

```bash
ollama pull llama3.2
# Or match whatever you set as OLLAMA_MODEL

curl -s "$OLLAMA_HOST/api/tags" | head   # default OLLAMA_HOST=http://localhost:11434
pnpm --filter @newsroom/ai smoke
OLLAMA_SMOKE=1 pnpm --filter @newsroom/ai smoke
pnpm worker:rank
```

#### Update (host)

Re-run the install script:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Or re-extract the tarball for your arch (see Manual install). Pin a version:

```bash
curl -fsSL https://ollama.com/install.sh | OLLAMA_VERSION=0.5.7 sh
```

Release tags: https://github.com/ollama/ollama/releases

#### Uninstall (host)

```bash
sudo systemctl stop ollama
sudo systemctl disable ollama
sudo rm /etc/systemd/system/ollama.service

# Remove libraries (path depends on install layout: /usr/lib, /usr/local/lib, or sibling of bin)
sudo rm -rf /usr/lib/ollama /usr/local/lib/ollama
sudo rm -r "$(which ollama | tr 'bin' 'lib')" 2>/dev/null || true

sudo rm "$(which ollama)"
sudo userdel ollama
sudo groupdel ollama
sudo rm -rf /usr/share/ollama
```

Upstream source for the host-install steps: [docs.ollama.com/linux](https://docs.ollama.com/linux) (snapshot for local ops; re-check upstream only when changing install method).
