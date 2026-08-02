# Newsroom — focused news aggregator
ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))

COMPOSE ?= docker compose
PNPM ?= pnpm
OLLAMA_MODEL ?= llama3.2

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

up: ## Start Postgres + Ollama (Compose)
	$(COMPOSE) -f $(ROOT)/docker-compose.yml up -d
	@echo "Postgres: localhost:5432  Ollama: http://localhost:11434"

up-postgres: ## Start Postgres only (skip Ollama)
	$(COMPOSE) -f $(ROOT)/docker-compose.yml up -d postgres
	@echo "Postgres: localhost:5432"

up-gpu: ## Start Compose with NVIDIA GPU passthrough for Ollama
	$(COMPOSE) -f $(ROOT)/docker-compose.yml -f $(ROOT)/docker-compose.gpu.yml up -d
	@echo "Postgres: localhost:5432  Ollama (GPU): http://localhost:11434"

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

ollama-pull: ## Pull ranking model into Compose Ollama (OLLAMA_MODEL=…)
	docker exec -it newsroom-ollama ollama pull $(OLLAMA_MODEL)

verify: ## Local acceptance: health + sign-up (web must be up)
	cd $(ROOT) && ./scripts/verify-scaffold.sh
