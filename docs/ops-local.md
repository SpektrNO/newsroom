# Local ops notes

## Gotcha: `packages/*` changes need a rebuild for the web app

`@newsroom/ai` and `@newsroom/db` publish compiled `dist/*.js` (see their `package.json` `exports`); `apps/web` imports that build output, not the TypeScript source, even though it's listed in `transpilePackages` (that only widens Next's compiler to those files — it does not change module resolution away from `dist/`). CLI scripts (`pnpm worker:rank`, `worker:ingest`, `worker:start`) rebuild `@newsroom/ai` automatically before running, but the web app's in-process routes (e.g. `POST /api/feed/rank`) do not. If you edit `packages/ai/src/**` or `packages/db/src/**` while `pnpm --filter @newsroom/web dev` is already running, that dev server keeps serving the stale compiled behavior until you rebuild and restart it:

```bash
pnpm build                                   # or: pnpm --filter @newsroom/ai build
# then restart the web dev server (Next does not watch dist/ changes)
```

`pnpm dev` (fresh start) now runs `^build` first via `turbo.json`, so cold starts are safe — this only bites you when editing source against an *already-running* dev server.

## Environment files

Two different processes load two different files. Mixing them up is a common gotcha (e.g. `RANK_BATCH_SIZE=20` in root `.env` while **Rank latest** still logs `batch=30`).

| File | Who loads it | Used for |
|------|----------------|----------|
| **Repo root `.env`** | Worker via `tsx --env-file=../../.env` (`pnpm worker:ingest`, `worker:rank`, `worker:start`, …). GitHub scripts. Optional seed. | Background ingest/rank/prune; CLI one-shots |
| **`apps/web/.env.local`** | Next.js only (`pnpm --filter @newsroom/web dev` / `start`) | Auth, health, chat, **Rank latest** (`POST /api/feed/rank` runs *in* the web process), Settings APIs |

**Setup**

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
# Set the same BETTER_AUTH_SECRET (≥32 chars) in both.
# Copy any shared rank/Ollama overrides into BOTH files when you change them.
```

| Variable group | Root `.env` | `apps/web/.env.local` |
|----------------|:-----------:|:---------------------:|
| `DATABASE_URL`, Better Auth URLs/secret | yes | yes (required for web) |
| `OLLAMA_*`, `AI_PROVIDER`, `OPENAI_*`, `GOOGLE_AI_*`, `AI_CREDENTIALS_KEY`, `RANK_MODEL_*`, `RANK_BATCH_SIZE`, timeouts | yes (worker rank) | yes (**Rank latest** / chat / health / BYOK) |
| `AI_TOKEN_*`, `RANK_AI_MAX_*`, score/article TTL | yes (worker) | yes (Rank latest + Settings usage) |
| `BLUESKY_APPVIEW_URL` | yes (worker ingest) | only if a web path ever fetches Bluesky (ingest is worker) |
| `LANGSEARCH_API_KEY` | no | optional — Sources **Find a feed** (`POST /api/feed-search`); omit → `503 feed_search_not_configured` |
| `REDDIT_USER_AGENT`, `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | yes (worker ingest) | no — Reddit fetch is worker-only |
| `GITHUB_*`, `SEED_USER_ID`, `NEWSROOM_WORKER_ONCE` | yes | no |
| `EXPO_PUBLIC_API_URL` | optional (docs/mobile) | no — use `apps/mobile` env |

After changing `apps/web/.env.local`, **restart** the Next dev server.

### Auth via ngrok (or other tunnels)

Better Auth rejects sign-in when the browser `Origin` is not in `trustedOrigins` (`invalid origin`).

1. Point **both** auth URLs at the HTTPS tunnel (no trailing slash), in `apps/web/.env.local`:

```bash
BETTER_AUTH_URL=https://YOUR_SUBDOMAIN.ngrok-free.app
NEXT_PUBLIC_BETTER_AUTH_URL=https://YOUR_SUBDOMAIN.ngrok-free.app
```

2. If you still need localhost sign-in in the same process, keep the tunnel as `BETTER_AUTH_URL` **or** list extras:

```bash
BETTER_AUTH_TRUSTED_ORIGINS=https://YOUR_SUBDOMAIN.ngrok-free.app
```

(`localhost` / `127.0.0.1:3000` are already trusted.)

3. Restart `pnpm --filter @newsroom/web dev`. Use the **https** ngrok URL in the browser (not `http://localhost`).

Ngrok free interstitial / changing subdomain → update env and restart again.

## Compose

```bash
docker compose up -d          # Postgres + Ollama
docker compose up -d postgres # Postgres only
# or: make up                 # Postgres; Compose Ollama only if :11434 is free
```

Default `DATABASE_URL`:

```text
postgres://newsroom:newsroom@localhost:5432/newsroom
```

Ollama listens on `http://localhost:11434` (`OLLAMA_HOST`). First time, pull the ranking model:

```bash
make ollama-pull
# or: docker exec -it newsroom-ollama ollama pull llama3.2
# or (host install): ollama pull llama3.2
```

Optional: also pull one of the stronger models (see [Model options](#model-options)) if you use the **Standard** ranking tier (defaults to `llama3.1:8b`) or want a better Fast/`OLLAMA_MODEL` than `llama3.2`:

```bash
OLLAMA_MODEL=llama3.1:8b make ollama-pull
OLLAMA_MODEL=qwen2.5:7b make ollama-pull
```

Install Ollama on the **host** only if you want easier GPU access — see [Ollama](#ollama). Do not run host and Compose Ollama at the same time (both use port `11434`). If host Ollama is already running, `make up` starts Postgres and **skips** the Compose Ollama service instead of failing with `address already in use`.

## Health (`GET /api/health`)

Unauthenticated JSON:

```json
{
  "status": "ok" | "degraded" | "error",
  "checks": {
    "database": "ok" | "error",
    "ai": "ok" | "error",
    "ollama": "ok" | "error"
  },
  "aiProvider": "ollama" | "openai" | "google",
  "timestamp": "<ISO-8601>"
}
```

`checks.ai` is the configured provider (`AI_PROVIDER`). `checks.ollama` is a **legacy alias** of `ai` (same value) for older clients.

| `status` | Meaning |
|----------|---------|
| `ok` | DB and AI provider both reachable |
| `degraded` | App up; at least one dependency failed (HTTP 200) |
| `error` | Both DB and AI failed (HTTP 503) |

AI down must not crash the process — report `checks.ai: "error"`.

## AI smoke

```bash
pnpm --filter @newsroom/ai test          # always offline-safe (includes OpenAI/Google mocks)
pnpm --filter @newsroom/ai smoke         # skips if configured provider unreachable
AI_SMOKE=1 pnpm --filter @newsroom/ai smoke       # fail if unreachable
OLLAMA_SMOKE=1 pnpm --filter @newsroom/ai smoke   # same (legacy alias)
```

## Cloud AI providers (`AI_PROVIDER`)

Rank and Advisor use `createAiProvider()` from `packages/ai`. Default remains local Ollama.

| `AI_PROVIDER` | Required env | Default models (fast / standard) |
|---------------|--------------|----------------------------------|
| `ollama` (default) | `OLLAMA_HOST`, `OLLAMA_MODEL` | `llama3.2` / `llama3.1:8b` |
| `openai` | `OPENAI_API_KEY`; optional `OPENAI_BASE_URL`, `OPENAI_MODEL` | `gpt-4o-mini` / `gpt-4o` |
| `google` | `GOOGLE_AI_API_KEY`; optional `GOOGLE_AI_MODEL` | `gemini-2.0-flash` |

`RANK_MODEL_FAST` / `RANK_MODEL_STANDARD` override those defaults when set. Put the same `AI_PROVIDER` + keys in **root `.env` and `apps/web/.env.local`**. No browser→vendor calls — only worker and Next BFF.

BYOK (per-user OpenAI/Google keys): set the same 64-hex `AI_CREDENTIALS_KEY` in root `.env` and `apps/web/.env.local`, then save a key under Settings → Your AI key. See [ADR 007](./decisions/007-ai-byok.md). If unset, BYOK stays disabled and the deploy uses operator `AI_PROVIDER` only.

## Ingest (HN + Substack) and rank

```bash
pnpm db:migrate
pnpm db:seed                 # demo@example.com / newsroom-demo + HN + Platformer RSS + "AI & infra" topic
# Or: SEED_USER_ID=<better-auth-user-id> pnpm db:seed
# Then ingest + rank so that user gets feed rows:

pnpm worker:ingest           # one-shot ingest; enqueues pending rank (does not wait on AI)
pnpm worker:rank             # one-shot keyword + AI rank → user_article_scores
# Or: Feed UI → Rank latest (current user only; requires configured AI provider)
pnpm --filter @newsroom/worker start   # poll Postgres jobs (ingest ~12 min + rank)
# Recovers stale `running` jobs (~45m) left by Ctrl+C/crash; otherwise a stuck
# ingest blocks scheduling the next pass and the feed shows "Ingested … ago" forever.

pnpm sources:test            # mocked adapter fixtures
pnpm worker:test             # ingest + rank (mocked AI) + real Postgres
pnpm web:test                # topics/feed parsers + session isolation
pnpm --filter @newsroom/ai test   # keyword + rank parse + cloud provider mocks
```

- HN: Firebase `topstories` **and** `newstories` + item hydrate, ≤100 IDs per list then dedupe; optional OP `kids[0]` comment → summary (see [001](./decisions/001-ingest-url-and-hn.md)).
- Ranking formulas / batch size: [002](./decisions/002-hybrid-ranking.md). Optional `RANK_BATCH_SIZE` (20–50, default 30). Generate calls use provider timeouts (`OLLAMA_TIMEOUT_MS` / `OPENAI_TIMEOUT_MS` / `GOOGLE_AI_TIMEOUT_MS`, default **5 minutes**).
- Sources API (session cookie): `GET/POST /api/sources`, `PATCH/DELETE /api/sources/:id`.
- Topics / feed API: `GET/POST /api/topics`, `PATCH/DELETE /api/topics/:id`, `GET /api/feed`, `POST /api/feed/:articleId/seen|saved|dismissed`.
- Jobs: `type=ingest` and `type=rank`; successful ingest enqueues rank if none open.

---

## Ollama

Newsroom talks to Ollama over HTTP (`OLLAMA_HOST`, default `http://localhost:11434`) when `AI_PROVIDER=ollama` (default). Which process serves that port is up to you.

| Approach | When to use |
|----------|-------------|
| **Docker Compose (recommended)** | Default — `docker compose up -d` starts Postgres and Ollama together. Add `docker-compose.gpu.yml` for NVIDIA GPU passthrough (see [GPU with Docker Compose](#gpu-with-docker-compose)) |
| **Host install (Linux)** | Optional — GPU without touching Docker's runtime config, or non-NVIDIA (AMD ROCm) |

Both expose the same API. App env does not change. Do **not** run both at once on port `11434`.

Newsroom defaults (see `.env.example`):

| Variable | Default | Role |
|----------|---------|------|
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama base URL |
| `OLLAMA_MODEL` | `llama3.2` | Default model for non-tiered calls (chat/advisor) and fallback for the **fast** ranking tier |
| `RANK_MODEL_FAST` | *(unset → `OLLAMA_MODEL` → `llama3.2`)* | Model when Settings ranking tier is **Fast** |
| `RANK_MODEL_STANDARD` | *(unset → `llama3.1:8b`)* | Model when Settings ranking tier is **Standard** |

Without a reachable AI provider: auth, ingest, topics, and keyword-only ranking still work; health is `degraded` (`checks.ai: "error"`). AI scores, AI “why” reasons, and near-dup hints are missing until a model is reachable. Users on the **None** ranking tier never call the provider.

### Ranking model tiers

Each signed-in user picks a ranking model tier in **Settings** (`none` \| `fast` \| `standard`; see [ADR 005](./decisions/005-user-selectable-rank-model.md)). Env vars `RANK_MODEL_FAST` and `RANK_MODEL_STANDARD` map those tiers to model ids (Ollama tags or cloud model names). The worker resolves the model per user:

| User tier | Model resolution |
|-----------|------------------|
| `none` | No AI — keyword shortlist only; ignores all three env vars |
| `fast` | `RANK_MODEL_FAST` → else `OLLAMA_MODEL` → else `llama3.2` |
| `standard` | `RANK_MODEL_STANDARD` → else `llama3.1:8b` (**does not** fall back to `OLLAMA_MODEL`) |

Examples:

```bash
# Chat + Fast ranking use llama3.2; Standard ranking uses llama3.1:8b (built-in default)
OLLAMA_MODEL=llama3.2

# Keep chat on llama3.2, but make Fast ranking use qwen and Standard use llama3.1:8b
OLLAMA_MODEL=llama3.2
RANK_MODEL_FAST=qwen2.5:7b
RANK_MODEL_STANDARD=llama3.1:8b

# Point both ranking tiers at stronger models; leave OLLAMA_MODEL for advisor/chat
RANK_MODEL_FAST=llama3.1:8b
RANK_MODEL_STANDARD=qwen2.5:7b
```

Pull every model you reference before ranking with that tier (Compose or host — see below). `fast` and `standard` share the same AI article/token budgets; only the model name differs.

### Model options

`llama3.2` (3B) is the default for `OLLAMA_MODEL` / Fast — fast and light, but a weak instruction-follower: it sometimes echoes the rank prompt's own JSON schema/instructions into the `reason` field instead of describing the article (mitigated in code, see [002-hybrid-ranking.md](./decisions/002-hybrid-ranking.md) decision 7, but not eliminated). Stronger local alternatives use the same `AiProvider`/`OllamaProvider` interface — pull the image, then point a tier (or `OLLAMA_MODEL`) at it:

| Model | Size | Notes |
|-------|------|-------|
| `llama3.2` | 2.0 GB | Default Fast / `OLLAMA_MODEL`. Fastest, weakest instruction-following. |
| `llama3.1:8b` | 4.9 GB | Default **Standard** tier. Noticeably better instruction-following; slower per batch. |
| `qwen2.5:7b` | 4.7 GB | Similar tier to `llama3.1:8b`; often stronger structured-JSON output. Good `RANK_MODEL_STANDARD` or `RANK_MODEL_FAST` override. |

```bash
docker exec -it newsroom-ollama ollama pull llama3.1:8b   # or qwen2.5:7b
# Optional overrides in .env — see Ranking model tiers above
# RANK_MODEL_STANDARD=llama3.1:8b
# OLLAMA_MODEL=llama3.1:8b   # only if you also want chat/advisor on this model
```

Larger/slower models may need a higher `OLLAMA_TIMEOUT_MS` (default 5 minutes) for CPU-only ranking batches.

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

The Compose service as checked in is **CPU-only** by default (no GPU device passthrough). That is fine for light ranking. For GPU acceleration you have two options: the Compose override below (keeps everything in Docker), or a host install (further below, e.g. if you don't want to touch Docker's runtime config).

### GPU with Docker Compose (NVIDIA)

One-time host prerequisite — install the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) and register it with Docker (Ubuntu/Debian, incl. WSL2 with an NVIDIA driver already working — check with `nvidia-smi` first):

```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker   # WSL2 without systemd: restart Docker Desktop instead
```

Then start Ollama with the GPU override layered on top of the base Compose file:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d ollama
```

Without the toolkit installed, that command fails fast with `could not select device driver "nvidia"` — plain `docker compose up -d` (no override) still works CPU-only. Verify the container sees the GPU:

```bash
docker exec newsroom-ollama nvidia-smi
docker logs newsroom-ollama | grep -i -E "gpu|cuda"
```

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

# Optional stronger alternatives — see Model options above:
ollama pull llama3.1:8b
ollama pull qwen2.5:7b

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
