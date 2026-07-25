# ADR 003: Scenario Builder e Configuração Declarativa de Cenários

> **Status:** Accepted  
> **Date:** 2026-07-24  
> **Deciders:** Chief Architect, Lead Game Designer, Lead Systems Engineer  
> **Context Area:** Core Engine, Scenario Management, CLI, Gateway API

---

## Context

Currently, the initial world state in GeoPolis is generated programmatically or via random seeds during ECS bootstrap. To enable comparative simulations ("What-If"), geopolitical analysis, and reproducible tests without recompilation, the engine needs a declarative mechanism to load and instantiate custom scenarios.

A scenario file must be self-contained: it defines the complete set of entities (countries, regions), their initial components (economic indicators, stability, production), diplomatic relation matrices, and scheduled event triggers — all in a single portable JSON file.

---

## Decision

### 1. Scenario Schema (Declarative)

A strongly typed contract (`IScenarioPreset`) with three sections:

- **`metadata`** — Name, version, description, and simulation configuration (e.g., `maxTicks`, `seed`).
- **`worldState`** — Entity definitions (countries, regions, treasury, economic indicators, pacts, diplomatic relations) using the same `IComponent` contracts as the ECS core.
- **`eventTriggers`** — Scheduled event scripts keyed by tick number (e.g., at tick N, fire a banking crisis or alter an indicator).

### 2. Schema Validation (Fail Fast)

A `ScenarioSchemaValidator` class validates every field of the incoming preset before any state is loaded:

- `metadata.name`, `metadata.version` must be non-empty strings.
- Each entity must have `id`, `name`, `entityType`, and a `components` array where every component has a `type` string.
- Each relation must have `sourceEntityId`, `targetEntityId`, `affinity` in [-1, 1], `tension` in [0, 1], and a valid `recognition` enum.
- Event triggers must have a non-negative `tick` and non-empty `eventType`.
- Duplicate entity IDs are rejected.

### 3. Reuse of Infrastructure

The `ScenarioLoader` creates a fresh `WorldState`, `EventBus`, `Timeline`, and `TickEngine`, then:

1. Loads all entities and their components into the WorldState (same `IComponent` model used by the domain systems).
2. Loads diplomatic relations as `RelationComponent` attachments.
3. Registers a `ScenarioTriggerSystem` (priority 2) that fires scheduled events at the correct ticks.
4. Registers all domain systems (`EconomySystem`, `PoliticsSystem`, `SanctionSystem`, etc.).

### 4. CLI & Gateway Integration

- **CLI flag:** `--scenario=path/to/scenario.json` (or `GEOPOLIS_SCENARIO` env var) in `buildEngine()`.
- **Gateway endpoints:**
  - `GET /api/v1/scenarios` — Returns current scenario metadata and tick count.
  - `POST /api/v1/scenarios/load` — Accepts `{ scenarioPath: string }`, validates and loads the scenario, replaces the active engine instance.

---

## Consequences

### Positive

- **Decoupled Authorship:** Scenario design is completely independent of ECS engine code. Analysts and game designers can craft scenarios in any JSON editor.
- **Reproducible Benchmarks:** Identical scenario files produce identical Tick 0 states, enabling deterministic performance and gameplay comparisons.
- **What-If Analysis:** Quick iteration by editing a JSON file and reloading via API without restarting the server.

### Negative

- **File Size:** Complex scenarios with 200+ entities and full component data may produce large JSON files (mitigated by the compact component serialization already used in save games).
- **No Runtime Mutation:** Scenarios are static at load time; dynamic alteration requires a separate mechanism (event triggers partially address this).
