# GeoPolis AI Engine

> **Version:** 1.0.0  
> **Architecture:** Clean Architecture + Entity-Component-System (ECS) + Event-Driven + LLM Intent Translation  
> **Status:** Production Ready / Fully Tested (81 test files, 467 tests passing)

---

## Architecture Overview

GeoPolis is a deterministic, high-performance, scenario-agnostic geopolitical simulation engine built in TypeScript and Node.js. It models complex nation-state dynamics across five core domains—**Economy**, **War**, **Politics**, **Diplomacy**, and **Intelligence**—using a pure Entity-Component-System (ECS) pattern decoupled from visual rendering and LLM interfaces.

```
┌──────────────────────────────────────────────────────────┐
│                      Interface Layer                     │
│    Web Dashboard (Vite/Canvas 2D) / REST API / WebSockets │
└────────────────────────────┬─────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│                     Application Layer                    │
│    APIGatewayRouter / TickEngine / ScenarioLoader / BYOD │
└────────────────────────────┬─────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│                    Agent & AI Layer                      │
│   AgentSystem / PerceptionFilter / ProviderFallbackChain │
│      (OpenAI / Anthropic) / SupabaseAgentMemoryStore     │
└────────────────────────────┬─────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│                       Domain Layer                       │
│    Economy  │  War  │  Politics  │  Diplomacy  │ Intelligence│
└────────────────────────────┬─────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│                        Core Layer                        │
│     EventBus  │  WorldState  │  Timeline  │  ECS Registry│
└──────────────────────────────────────────────────────────┘
```

---

## Core Architectural Pillars

1. **ECS & DDD Single Source of Truth**:
   - Entities (`IEntity`) represent nations (~208 sovereign actors), regions, armies, treaties, laws, crises, and projects.
   - Components (`IComponent`) are pure data containers.
   - Systems (`ISystem`) process components in priority order per tick and emit typed events to the `EventBus`.

2. **Event-Driven & Immutable Persistence**:
   - Systems do not mutate state directly across boundaries. All cross-domain communication flows through typed events.
   - The `Timeline` is an append-only ledger recording all mutations for auditability and deterministic replay.

3. **Perception-Limited Fog of War & LLM Integration**:
   - Agents (AI countries) access the world state solely through `PerceptionFilter` and dense state serialization (`dumpStateForAnalysis()`).
   - LLMs act strictly as intent translators. Payloads are validated by `IIntentParser` (*Fail Fast*) before reaching the `EventBus`.

4. **Multi-Provider LLM Chain & Persistent Memory**:
   - `ProviderFallbackChain` integrates OpenAI, Anthropic, and Mock fallback providers with retries and failover.
   - `SupabaseAgentMemoryStore` provides persistent memory with fallbacks to in-memory storage.

5. **Bring Your Own Directive (BYOD) Freeform Prompting**:
   - Players can type custom strategic directives (e.g., "Covertly support rebels while imposing tariffs on steel").
   - The engine translates freeform prompts into structured, validated game intents with predicted KPI delta forecasts.

6. **Web App Security Hardening**:
   - Built-in HTTP security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`).
   - Strict `.env` ignore rules and explicit production sourcemap disabling (`build.sourcemap: false`).

---

## Project Structure

```
.
├── data/                         # Scenario seed data (world-seed-2026.json,Presets)
├── docs/                         # Architecture docs, ADRs, and Roadmap
│   ├── future-roadmap.md
│   └── phase-0/
│       ├── adr/                  # Architecture Decision Records (ADR 001 - 005)
│       ├── module-map.md
│       └── vision-and-game-design.md
├── src/
│   ├── agents/                   # LLM Agents, Memory Stores, Provider Chains
│   ├── core/                     # Core Layer (EventBus, WorldState, Timeline, ECS)
│   ├── domain/                   # Domain Systems (Economy, War, Politics, Diplomacy, Intel)
│   ├── gateway/                  # Headless HTTP API Gateway & WebSockets
│   ├── persistence/              # Save/Load Snapshot Serialization
│   ├── scenarios/                # Declarative Scenario Loader & Schema Validator
│   └── server/                   # Express App & Hybrid Web Server
├── vite.config.ts                # Vite config with security headers & build settings
├── vitest.config.ts              # Vitest test suite configuration
└── package.json                  # Scripts & dependencies
```

---

## Quick Start & Scripts

### Prerequisites
- **Node.js**: >= 18.x
- **npm**: >= 9.x

### Installation
```bash
npm install
```

### Development
Start the Vite development server (frontend UI):
```bash
npm run dev
```

Start the Node.js headless engine & API server:
```bash
npm run dev:server
```

### Type Checking & Testing
Run TypeScript strict typecheck:
```bash
npm run typecheck
```

Run full Vitest test suite (467 unit & integration tests):
```bash
npm test
```

### Production Build
Compile TypeScript and build static web artifacts:
```bash
npm run build
```

Start production hybrid server:
```bash
npm start
```

---

## License & Attribution

GeoPolis AI Engine is developed under Clean Architecture and DDD principles.  
Copyright (c) 2026 GeoPolis AI Studio.
