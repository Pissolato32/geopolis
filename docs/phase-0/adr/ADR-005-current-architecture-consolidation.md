# ADR-005: Current ECS Architecture Consolidation

> **Status:** Accepted  
> **Date:** 2026-08-12  
> **Deciders:** GeoPolis project maintainers  
> **Supersedes:** architecture assumptions from ADR-004 where they conflict with the implemented code

---

## Context

The original Phase 0 documentation described a planned Clean Architecture with separate top-level `core`, `domain`, `agents`, `gateway`, `persistence` and `scenarios` trees. During implementation, these areas were consolidated under `src/engine/` so that the simulation has a single canonical runtime.

The project also evolved from the original dashboard concept into the current React/Vite presentation layer. Several older documents therefore describe paths, technologies and delivery phases that no longer correspond to the repository.

The current repository must have one unambiguous architectural reference for maintainers and coding agents.

## Decision

### 1. Canonical simulation engine

`src/engine/` is the only canonical simulation engine.

It contains:

- `core/` — ECS, WorldState, EventBus, Timeline, TickEngine and interfaces;
- `domain/` — Economy, War, Politics, Diplomacy, Intelligence and Demographics;
- `agents/` — perception, decision, goals, memory, parser and LLM providers;
- `gateway/` — HTTP/WebSocket transport and event broadcasting;
- `persistence/` — save/restore and persistence providers;
- `scenarios/` — scenario loading and scenario-specific support.

### 2. Application boundary

`src/engineAdapter.ts` is the preferred bridge between the ECS engine and the application/UI. `src/server/` provides the application server bootstrap. The React/Vite UI consumes application/engine state and does not implement simulation rules.

### 3. Domain boundaries

Cross-domain communication uses typed EventBus events. Systems should not call other domain Systems directly or depend on their internal implementation.

### 4. Agents and LLMs

Agents operate on filtered Perception State. LLM output is treated as intent, not authoritative simulation state. Intent must pass through the Strict Intent Parser before it can produce engine effects.

### 5. Legacy engine

`src/turnEngine.ts` is deprecated. It remains only for functionality that has not yet been migrated to ECS, currently including legacy covert-operations and multilateral-block rules. New simulation rules must not be added there.

### 6. Documentation hierarchy

When documents disagree:

1. current code in `src/engine/`;
2. `AGENTS.md` and `README.md`;
3. current ADRs, especially this ADR;
4. historical Phase 0 documents.

Historical documents should be preserved for architectural history, but they must not be interpreted as implementation instructions when they conflict with the current repository.

## Consequences

### Positive

- One clear source of truth for simulation behavior.
- Less risk of agents or developers modifying the deprecated engine.
- Clear boundary between simulation, application/server and presentation.
- Historical planning documents remain useful without misleading maintainers about the current tree.

### Negative

- Some older ADRs contain obsolete implementation details and must explicitly be marked as superseded.
- The remaining legacy rules require a deliberate migration plan before `src/turnEngine.ts` can be removed.

## Migration rule for future work

Any feature that still exists only in the legacy engine must be migrated by:

1. identifying the legacy behavior and its tests;
2. implementing the equivalent ECS components/events/systems;
3. adding deterministic regression/parity tests;
4. registering the new system in the canonical engine;
5. validating with lint, typecheck, tests and build;
6. removing the legacy implementation only after all consumers are migrated.
