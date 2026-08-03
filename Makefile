# Newsroom — focused news aggregator
ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))

COMPOSE ?= docker compose
PNPM ?= pnpm
OLLAMA_MODEL ?= llama3.2
OLLAMA_PORT ?= 11434

ifneq (,$(wildcard $(ROOT)/.env))
  include $(ROOT)/.env
  export
endif

.DEFAULT_GOAL := help

.PHONY: help setup install up up-postgres up-gpu down logs \
        migrate generate seed studio \
        web worker ingest rank prune \
        test test-ai test-web test-worker test-sources typecheck build \
        ollama-pull verify

help: ## Show this help
	@echo "Newsroom — useful commands"
	@echo ""
	@grep -E '^[a-zA-Z0-9_-]+:.*##' $(ROOT)/Makefile | sort | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Examples:"
	@echo "  make setup && make up && make migrate && make seed && make web"
	@echo "  make ingest && make rank"
	@echo "  make ollama-pull   # OLLAMA_MODEL=$(OLLAMA_MODEL)"

setup: ## First-time setup: copy env files + pnpm install
	@test -f $(ROOT)/.env || cp $(ROOT)/.env.example $(ROOT)/.env
	@test -f $(ROOT)/apps/web/.env.local || cp $(ROOT)/apps/web/.env.example $(ROOT)/apps/web/.env.local
	@echo "Created .env and apps/web/.env.local if missing — set BETTER_AUTH_SECRET (≥32 chars) in both."
	@echo "See docs/ops-local.md#environment-files"
	$(MAKE) install

install: ## Install workspace deps (pnpm)
	cd $(ROOT) && $(PNPM) install

# Host Ollama often already owns :11434; binding Compose Ollama then fails with
# "address already in use". Start Postgres always; only start Compose Ollama when
# the port is free (otherwise use the host daemon — same OLLAMA_HOST).
up: ## Start Postgres; Compose Ollama only if :11434 is free
	$(COMPOSE) -f $(ROOT)/docker-compose.yml up -d postgres
	@if bash -c 'exec 3<>/dev/tcp/127.0.0.1/$(OLLAMA_PORT)' 2>/dev/null; then \
		echo "Postgres: localhost:5432"; \
		echo "Port $(OLLAMA_PORT) already in use — skipping Compose Ollama (using host/other at http://localhost:$(OLLAMA_PORT))."; \
		echo "Stop host Ollama to use the container, or keep using make up-postgres. See docs/ops-local.md#ollama"; \
	else \
		$(COMPOSE) -f $(ROOT)/docker-compose.yml up -d ollama; \
		echo "Postgres: localhost:5432  Ollama (Compose): http://localhost:$(OLLAMA_PORT)"; \
	fi

up-postgres: ## Start Postgres only (skip Ollama)
	$(COMPOSE) -f $(ROOT)/docker-compose.yml up -d postgres
	@echo "Postgres: localhost:5432"

up-gpu: ## Start Compose with NVIDIA GPU for Ollama (needs free :11434)
	@if bash -c 'exec 3<>/dev/tcp/127.0.0.1/$(OLLAMA_PORT)' 2>/dev/null; then \
		echo "Port $(OLLAMA_PORT) in use — stop host Ollama before make up-gpu."; \
		echo "See docs/ops-local.md#ollama"; \
		exit 1; \
	fi
	$(COMPOSE) -f $(ROOT)/docker-compose.yml -f $(ROOT)/docker-compose.gpu.yml up -d
	@echo "Postgres: localhost:5432  Ollama (GPU): http://localhost:$(OLLAMA_PORT)"

down: ## Stop Compose services
	$(COMPOSE) -f $(ROOT)/docker-compose.yml down

logs: ## Tail Compose logs
	$(COMPOSE) -f $(ROOT)/docker-compose.yml logs -f --tail=100

migrate: ## Apply Drizzle migrations
	cd $(ROOT) && $(PNPM) db:migrate

generate: ## Generate Drizzle migrations from schema
	cd $(ROOT) && $(PNPM) db:generate

seed: ## Seed demo user + HN + Platformer + example topic
	cd $(ROOT) && $(PNPM) db:seed

studio: ## Open Drizzle Studio
	cd $(ROOT) && $(PNPM) db:studio

web: ## Next.js dev server (:3000)
	cd $(ROOT) && $(PNPM) web:dev

worker: ## Long-running ingest + rank job poller
	cd $(ROOT) && $(PNPM) worker:start

ingest: ## One-shot ingest then exit
	cd $(ROOT) && $(PNPM) worker:ingest

rank: ## One-shot rank then exit (RANK_ARGS=-- --all-dirty optional)
	cd $(ROOT) && $(PNPM) worker:rank $(RANK_ARGS)

prune: ## One-shot prune stale scores + old articles
	cd $(ROOT) && $(PNPM) worker:prune-scores

test: ## Run AI + sources unit tests (offline-safe)
	cd $(ROOT) && $(PNPM) ai:test && $(PNPM) sources:test

test-ai: ## AI unit tests
	cd $(ROOT) && $(PNPM) ai:test

test-web: ## Web tests (needs Postgres)
	cd $(ROOT) && $(PNPM) web:test

test-worker: ## Worker integration tests (needs Postgres; AI mocked)
	cd $(ROOT) && $(PNPM) worker:test

test-sources: ## Source adapter tests
	cd $(ROOT) && $(PNPM) sources:test

typecheck: ## Turbo typecheck
	cd $(ROOT) && $(PNPM) typecheck

build: ## Turbo build
	cd $(ROOT) && $(PNPM) build

ollama-pull: ## Pull model (Compose container if running, else host ollama)
	@if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx newsroom-ollama; then \
		docker exec -it newsroom-ollama ollama pull $(OLLAMA_MODEL); \
	else \
		ollama pull $(OLLAMA_MODEL); \
	fi

verify: ## Local acceptance: health + sign-up (web must be up)
	cd $(ROOT) && ./scripts/verify-scaffold.sh
