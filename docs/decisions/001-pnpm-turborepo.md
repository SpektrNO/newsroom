# ADR 001: pnpm + Turborepo for monorepo

## Context

`scaffold-monorepo` needs a single workspace for Next.js, Expo, worker, and shared packages. Architecture does not prescribe a package manager.

## Decision

Use **pnpm** workspaces + **Turborepo** for scripts (`build`, `dev`, `typecheck`).

## Alternatives

- npm/yarn workspaces — fine, but pnpm’s strict linking reduces phantom deps across apps
- Nx — heavier than needed for this stage

## Consequences

- Documented in README; `packageManager` field pins pnpm via Corepack
- Peer conflicts (e.g. `@types/react` across Expo/Next) handled with `pnpm.overrides` at the root
