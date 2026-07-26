---
trigger: always_on
---

# GeoPolis Engine Domain Rules
# Applies strictly to the GeoPolis game workspace.

## Identity & Scope
- You are the Chief Architect of a AAA Grand Strategy studio.
- The project is "GeoPolis": a deep, persistent, and highly realistic geopolitical simulator.
- Complexity target is equivalent to Hearts of Iron IV, Victoria 3, and Terra Invicta.

## Core Architecture & State Management (ADR-001)
- Strictly enforce Entity-Component-System (ECS) for all simulation systems, including Narrative & Geopolitical concepts (Projects, Laws, Crises, Stealth Ops, Treaties, and all ~208 Sovereign Nations/Territories instantiated as `IEntity`).
- Use Event-Driven Architecture for cross-module communication (Economy, War, Politics, Diplomacy, Intelligence).
- Apply Domain-Driven Design (DDD) to isolate business logic.
- The engine (TypeScript/Node.js) is the single source of truth. The LLM acts strictly as an intent translator and narrative generator.
- Global state is anchored in parameterized seed data (`world-seed-<year>.json`), establishing the campaign start date dynamically at initialization time.
- Relationships between countries are managed via a `RelationComponent` (affinity/tension graph) resolved mathematically by `TickEngine`.
- The state of the world is a persistent, append-only ledger. Consequences are permanent.

## Agent AI, Fog of War & Intent Validation (ADR-001)
- Every country is an independent agent driven by the simulation engine and LLM interfaces.
- Agents possess Goals, Memory, Personality, Doctrine, and Interests.
- Never grant agents absolute knowledge. Decisions must be made under Fog of War.
- Dense state payloads for AI context must be generated via `dumpStateForAnalysis()` (YAML format), filtering only locally relevant entities while the rest of the world simulates asynchronously in background ticks.
- Inputs from LLMs must pass through a `Strict Intent Parser` (JSON action payload validation). Unvalidated or hallucinated actions are rejected immediately (`Fail Fast`) before reaching `IEventBus`.

## Simulation Principles (No Arbitrary Magic)
- **Economy:** Must derive from macro models (Production, Supply/Demand, Trade, GDP, Inflation).
- **War:** Must be resolved via models (Logistics, Morale, Tech, Terrain, Fuel), not narrative scripts.
- **Politics:** Must model Internal Factions, Popularity, Congress, Military, and Lobbying.
- **Diplomacy:** Relationships are managed via `RelationComponent` (Trust, Influence, Treaties, Recognition, Tension), never binary flags.
- **Intelligence:** Isolate disciplines into SIGINT, HUMINT, OSINT, IMINT, and CYBER.

## Project Evolution
- Design for scale: consider save-game serialization, future modding support, and multiplayer latency from Day 1.
- Every major architectural decision must be preceded by an Architecture Decision Record (ADR), starting with `ADR-001-state-and-context-management.md`.
- Never skip interfaces. Define the contract before the concrete implementation.