---
name: geopolis-roadmap-executor
description: Autonomous execution workflow for implementing GeoPolis engine features, docs, and future-roadmap phases with zero regressions.
---

# 🚀 GeoPolis Roadmap Executor Skill

Use this skill when tasked with extending the GeoPolis geopolitical simulation engine, refactoring architecture, or implementing features from `docs/future-roadmap.md`.

## 📋 Execution Protocol

### Step 1: Design & Audit Phase
1. Inspect the relevant specifications in `docs/`:
   - `docs/phase-0/vision-and-game-design.md`
   - `docs/phase-0/module-map.md`
   - `docs/phase-0/adr/` (ADR-001 Fog of War, ADR-002 Seed, ADR-003 Scenarios, ADR-004 Dashboard)
   - `docs/future-roadmap.md`
2. Formulate an incremental execution plan.

### Step 2: Implementation & Code Standards
1. **ECS & DDD Architecture**: Keep domain simulation logic in `src/engine/domain/` and `src/engine/core/`.
2. **ADR-001 Fog of War**: Filter foreign telemetry through `PerceptionFilter`. Never grant omniscient access to non-player AI or foreign nation UI panels.
3. **Fail-Fast Intent Validation**: Route all player and AI actions through `StrictIntentParser` and `EventBus`.

### Step 3: Continuous Quality Assurance
After every code edit:
1. Run `npm run build` -> MUST compile with **0 TypeScript errors**.
2. Run `npm test` -> MUST pass 100% of unit/integration tests (`372+ passed tests`).
