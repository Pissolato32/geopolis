# ADR 001: State Management, Narrative ECS, and Geopolitical Context

> **Status:** Accepted  
> **Date:** 2026-07-24  
> **Deciders:** Chief Architect, Lead Game Designer, Lead Systems Engineer  
> **Context Area:** Core Engine, Persistence, Fog of War, AI Integration

---

## Context

GeoPolis aims to be a deterministic, AAA-quality geopolitical simulation engine. The direct usage of LLMs to maintain or track game state introduces two fatal architectural flaws:

1. **Context Amnesia:** Long-term narrative and strategic elements (stealth operations, legislative proposals, infrastructure mega-projects, diplomatic crises) are forgotten as the token window rolls over.
2. **Context Explosion:** Simulating the ground-truth state of the real world (~208 sovereign entities and territories, with complex relational matrices of affinity, trade, and diplomatic recognition) drastically exceeds operational context limits and token budgets if exposed in full on every turn.

The engine (TypeScript/Node.js) must be the **single source of truth**, and the LLM must act strictly as an intent translator and prose generator.

---

## Decision

To guarantee structural determinism and extreme token efficiency (in full compliance with `token-optimization.md`), we will implement the following foundations in the engine:

### 1. Narrative & Geopolitical ECS (Single Source of Truth)
- Projects, Laws, Crises, Stealth Operations, and all ~208 Sovereign Nations/Territories will be instantiated as `IEntity` in the ECS engine.
- Global state will be anchored in parameterized seed data (`world-seed-<year>.json`), dynamically establishing the campaign start date (`startDate`) at initialization time based on player choice or seed configuration, injecting initial diplomatic tension matrices (e.g., dictatorial regimes, economic blocs, state non-recognition).
- Inter-state relationships will be managed via a `RelationComponent` (affinity/tension graph) resolved mathematically by the `TickEngine`.

### 2. Fog of War & Dense Serialization (Output Optimization)
- The AI will **never** receive the complete ground-truth World State.
- The `dumpStateForAnalysis()` utility (defined via `IStateSerializer`) will filter and serialize (in dense YAML format) only entities, crises, and countries strictly relevant to the player's immediate focus or local scope.
- The remainder of the world will be simulated asynchronously by the engine in background ticks (`Background Ticks`).

### 3. Strict Intent Parser (Input Validation & Fail Fast)
- The LLM will be instructed to finalize all narrative output with a structured JSON payload representing the player's chosen action.
- The engine will inject this action into the `IEventBus` only after passing strict schema and state validation (`Fail Fast`).
- Hallucinated or illegal actions produced by the LLM will be rejected immediately before state mutation occurs.

---

## Consequences

### Positive
- **Infinite Durability:** Long-term narrative and strategic history is preserved permanently in the ECS without context decay.
- **Stable Token Costs:** Token consumption remains constant regardless of global scale (200+ countries) due to Fog of War filtering.
- **Strict Determinism:** LLM hallucinations cannot corrupt simulation state.

### Negative
- **Engineering Complexity:** Increased upfront complexity in Phase 1 and Phase 2, requiring ECS to handle abstract diplomatic concepts and narrative constructs alongside physical entities.
