# GeoPolis Engine — Vision & Game Design Document (Core Engine)

> **Document Type:** Phase 0 — Foundational Architecture  
> **Version:** 1.0  
> **Date:** 2026-07-24  
> **Author:** Chief Architect  
> **Status:** Draft — Pending Review

---

## Part I — Vision Document

### 1. Purpose

GeoPolis is not a game. It is a **Simulation Engine** — a scenario-agnostic runtime that models geopolitical systems with causal determinism and absolute persistence.

The game layer (maps, UI, scenarios) is merely a data consumer. The engine itself knows nothing about "World War II" or "Cold War". It understands only entities, components, systems, events, and rules of causality. Swap the data files and the same engine simulates a fictional planet, an alternate history, or a contemporary geopolitical crisis.

**Core Identity:** A deterministic, event-sourced, ECS-driven simulation engine for deep geopolitical modeling.

### 2. Problem Statement

Existing grand strategy engines suffer from three fundamental flaws:

| Flaw | Description | Impact |
|------|-------------|--------|
| **Scenario-Engine Coupling** | Game logic is hardcoded to a specific historical setting. Modding requires reverse-engineering internals. | Zero reusability. Every new scenario requires a new codebase. |
| **Narrative Scripting** | Outcomes are driven by scripted event chains, not emergent causality. "Events" happen because a designer wrote them, not because the simulation produced them. | Predictable, non-emergent gameplay. No true "what-if" analysis. |
| **Omniscient AI** | AI opponents access the full game state. Difficulty is faked by giving AI resource bonuses, not by improving decision-making. | Breaks immersion. Fog of War is cosmetic, not structural. |

GeoPolis addresses all three by enforcing:
- **Structural separation** between engine and scenario data.
- **Emergent causality** through deterministic system pipelines.
- **Perception-limited agents** operating under real Fog of War.

### 3. Foundational Principles

#### 3.1 Causality Over Randomness
Every consequence in the simulation has a traceable chain of causes. A currency collapse happens because of trade deficits, debt accumulation, and failed policy responses — never because of a random dice roll. Stochastic elements exist only in perception (intelligence accuracy, espionage success probability) and are always bounded by causal preconditions.

#### 3.2 Absolute Persistence (Append-Only State)
The world state is an immutable, append-only ledger. Nothing is deleted. A treaty signed in Tick 42 remains in the Timeline forever, even if nullified in Tick 200. This enables:
- **Full auditability:** Every state mutation can be traced to its originating event.
- **Time-travel debugging:** Replay the simulation from any checkpoint.
- **Deterministic replay:** Given the same initial state and events, the simulation produces identical results.

#### 3.3 Fog of War as a First-Class Constraint
Agents (country AI) never access the global World State directly. They access a **Perception Layer** — a filtered, delayed, and potentially inaccurate projection of reality. An agent's decision quality is bounded by its intelligence capabilities, not by engine omniscience.

#### 3.4 Scenario Agnosticism
The engine defines no countries, no maps, no units, no technologies. These are all **data** loaded at runtime. The engine provides:
- Entity creation and lifecycle management.
- Component attachment and query.
- System execution pipelines.
- Event publication and subscription.

A "scenario pack" provides the actual geopolitical content.

### 4. Technical Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Language** | TypeScript | Strict typing, rich ecosystem, IDE support, developer velocity |
| **Runtime** | Node.js | Non-blocking I/O, event-loop alignment with Event Bus architecture |
| **Architecture** | Clean Architecture | Dependency inversion, testability, layer isolation |
| **Design Patterns** | ECS + DDD + Event Sourcing | Separation of data (Components), logic (Systems), identity (Entities), and communication (Events) |
| **Principles** | SOLID | Single Responsibility across systems, Open/Closed for modding, Dependency Inversion for testability |

### 5. Risk Analysis

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **ECS performance at scale** (10K+ entities) | High | Medium | Component pooling, sparse sets, system scheduling optimization. Benchmark at Phase 1. |
| **Event Bus bottleneck** under high event volume | High | Medium | Event batching per tick, priority queues, lazy subscriber evaluation. Profile at Phase 2. |
| **Append-only state growth** consuming memory | Medium | High | Periodic snapshot compaction. Archive cold Timeline segments to disk. |
| **Agent AI latency** (LLM-driven decisions per tick) | Critical | High | Async agent evaluation, decision caching, agent priority tiers (major powers evaluate every tick, minor powers every N ticks). |
| **Deterministic replay** broken by floating-point drift | Medium | Low | Fixed-point arithmetic for economic calculations. Canonical serialization format. |
| **Scenario data validation** (malformed data packs) | Medium | Medium | Schema validation layer at data load time. Reject invalid scenarios before simulation starts. |

### 6. Phase Roadmap

| Phase | Name | Objective |
|-------|------|-----------|
| **0** | Architecture | Vision, GDD, Module Map, ADRs, Core Contracts ← *current* |
| **1** | Core Engine | World State, Event Bus, Timeline, Tick Engine, ECS runtime |
| **2** | Domain Models | Economy, War, Politics, Diplomacy, Intelligence systems |
| **3** | Agent AI | LLM-driven agents, memory, perception, risk evaluation, decision-making |
| **4** | Interface | Reports, dashboards, intelligence panels, data consumption layer |
| **5** | Balancing | Mass simulations, system calibration, parameter tuning |

---

## Part II — Game Design Document (Core Engine)

> This section describes the **engine's structural pillars**, not game mechanics. No balancing values, no unit stats, no technology trees. Only the machinery that will process them.

### 1. Tick Engine (Simulation Cycle)

The Tick Engine is the heartbeat of the simulation. Each **tick** represents a discrete unit of simulated time (configurable: 1 day, 1 week, 1 month depending on scenario granularity).

#### 1.1 Tick Lifecycle

```
┌─────────────────────────────────────────────────┐
│                    TICK N                        │
├─────────────────────────────────────────────────┤
│  Phase 1: Input Collection                      │
│    → Gather queued player/agent actions          │
│    → Validate action legality against state      │
│                                                  │
│  Phase 2: System Execution Pipeline              │
│    → Execute registered systems in priority order│
│    → Each system: read state → compute → emit    │
│    → Systems DO NOT mutate state directly         │
│                                                  │
│  Phase 3: Event Resolution                       │
│    → Event Bus processes all emitted events       │
│    → Events are applied to World State            │
│    → Timeline records all mutations               │
│                                                  │
│  Phase 4: Perception Update                      │
│    → Recalculate each agent's visible state       │
│    → Apply intelligence modifiers (delay, noise)  │
│                                                  │
│  Phase 5: Agent Evaluation                       │
│    → Agents assess their perceived state          │
│    → Agents queue actions for Tick N+1            │
│                                                  │
│  Phase 6: Snapshot (conditional)                  │
│    → If snapshot interval reached, persist state  │
└─────────────────────────────────────────────────┘
```

#### 1.2 System Execution Order

Systems are registered with an explicit **priority** value. Lower values execute first. This guarantees deterministic ordering:

| Priority | System Category | Examples |
|----------|----------------|----------|
| 100 | Resource Production | Raw material extraction, agriculture, energy |
| 200 | Economic Processing | Trade resolution, market pricing, GDP calculation |
| 300 | Political Processing | Faction influence, approval ratings, legislative actions |
| 400 | Diplomatic Processing | Treaty evaluation, alliance obligations, sanctions |
| 500 | Military Processing | Unit movement, combat resolution, logistics |
| 600 | Intelligence Processing | Espionage resolution, intelligence gathering, counterintelligence |
| 700 | Consequence Propagation | Second-order effects, cascading events |

#### 1.3 Determinism Guarantee

Given identical initial state and identical input actions, the Tick Engine must produce **byte-identical** output state. This requires:
- Fixed system execution order (priority-based).
- No dependency on wall-clock time.
- No non-deterministic data structures (e.g., unordered hash maps for iteration).
- Fixed-point arithmetic for economic calculations.

### 2. Event Bus (Communication Backbone)

The Event Bus is the **sole** communication channel between systems. No system may call another system directly. No system may read another system's internal state. All inter-system communication flows through typed, auditable events.

#### 2.1 Core Properties

| Property | Description |
|----------|-------------|
| **Typed** | Every event has a strict TypeScript interface. No `any`, no generic payloads. |
| **Immutable** | Published events cannot be modified after emission. |
| **Ordered** | Events within a tick are processed in emission order. Cross-tick ordering is guaranteed by tick sequence. |
| **Auditable** | Every event is recorded in the Timeline with: source system, tick number, timestamp, payload hash. |
| **Replayable** | The full event stream can be replayed to reconstruct any point in the simulation. |

#### 2.2 Event Categories

| Category | Purpose | Example |
|----------|---------|---------|
| **StateChange** | A system requests a mutation to World State | `EconomyGDPUpdated`, `UnitMoved` |
| **Signal** | A system notifies others of a condition (no state mutation) | `WarDeclared`, `AllianceInvoked` |
| **Query** | A system requests derived data from another domain | `RequestTradeBalance`, `RequestMilitaryStrength` |
| **Perception** | Intelligence system updates an agent's known state | `IntelReportGenerated`, `FogOfWarUpdated` |

#### 2.3 Subscription Model

Systems subscribe to event **types**, not to source systems. This enforces decoupling:

```
EconomySystem subscribes to: [WarDeclared, SanctionImposed, TradeAgreementSigned]
WarSystem subscribes to: [ResourceShortage, FuelDepleted, MoraleCollapsed]
```

Neither system knows or cares about the other's existence. They react to events.

### 3. World State & Timeline (Persistence)

#### 3.1 World State

The World State is the **current snapshot** of the entire simulation — all entities and their components. It is the single source of truth for the present.

- **Read-only during system execution.** Systems query state but never mutate it directly.
- **Mutated only by the Event Resolution phase** of the Tick Engine, applying validated events.
- **Queryable** by entity ID, component type, or spatial/relational indices.

#### 3.2 Timeline (Append-Only Ledger)

The Timeline is the **complete history** of all events that have ever occurred in the simulation.

| Field | Type | Description |
|-------|------|-------------|
| `tickNumber` | `number` | The tick in which the event occurred |
| `sequenceId` | `number` | Monotonic order within the tick |
| `eventType` | `string` | Fully qualified event type name |
| `sourceSystem` | `string` | The system that emitted the event |
| `payload` | `Readonly<T>` | The immutable event data |
| `payloadHash` | `string` | Integrity hash for audit/replay verification |

**Properties:**
- Events are **never deleted**. A "cancelled treaty" is a new event (`TreatyCancelled`), not the removal of `TreatySigned`.
- Supports **range queries**: "all economic events between Tick 100 and Tick 200".
- Supports **snapshot checkpoints**: periodic full-state snapshots enabling fast restore without full replay.

#### 3.3 Serialization Strategy

| Concern | Approach |
|---------|----------|
| **Save Game** | Serialize current World State snapshot + Timeline checkpoint reference |
| **Full History** | Stream Timeline to disk as append-only log file |
| **Modding** | Scenario packs as validated JSON/YAML data files |
| **Deterministic Replay** | Store initial state + ordered event stream. Replay produces identical final state. |

### 4. ECS Architecture

#### 4.1 Entities

Entities are **identity containers** with no behavior and no data of their own. They are unique IDs to which Components are attached.

| Entity Type | Description | Example Components |
|------------|-------------|-------------------|
| Country | A sovereign geopolitical actor (~208 nations/territories) | Economy, Politics, Military, Diplomacy, Intelligence, RelationComponent |
| Region | A geographic subdivision | Population, Resources, Infrastructure, Terrain |
| Unit | A military formation | Position, Strength, Morale, Supply, Movement |
| Treaty | A diplomatic agreement | Signatories, Terms, Duration, Status |
| Resource | A tradeable commodity type | MarketPrice, GlobalSupply, GlobalDemand |
| Project / Infra | Long-term mega-project or development initiative | Progress, Cost, Investor, Impact |
| Law / Policy | Legislative act or regulatory framework | Status, EnactmentTick, Scope, FactionSupport |
| Crisis / Event | Active geopolitical or economic emergency | Intensity, Escalation, Triggers, ResolutionTerms |
| Stealth Operation | Covert intelligence or cyber mission | AgencyId, TargetId, Progress, ExposureRisk |

#### 4.2 Components

Components are **pure data containers** — no methods, no behavior. They are serializable structs attached to entities.

Design rules:
- Every component must be independently serializable (for save games).
- No component may reference another component directly (no pointer chains).
- Components express **state**, not **behavior**.
- Cross-entity relationships are expressed through ID references, never object references.

#### 4.3 Systems

Systems are **stateless processors** that iterate over entities possessing specific component sets, reading the current state and emitting events.

Design rules:
- A system **reads** from World State (components).
- A system **emits** events to the Event Bus.
- A system **never mutates** World State directly.
- A system **never calls** another system.
- A system declares its **component dependencies** (which component types it queries).
- A system declares its **event subscriptions** (which event types trigger re-evaluation).
- A system declares its **priority** (execution order within a tick).

### 5. Fog of War & Perception Model

Fog of War is not a visual overlay. It is a **structural constraint** on information access.

#### 5.1 Perception Layer

Each agent (country AI) has a `PerceptionState` — a filtered, potentially inaccurate projection of the World State. The Perception Layer is computed per-agent per-tick based on:

| Factor | Effect |
|--------|--------|
| **Geographic Proximity** | Nearby regions are more visible |
| **Intelligence Capability** | SIGINT/HUMINT/OSINT/IMINT/CYBER disciplines determine what categories of information are accessible |
| **Diplomatic Relations** | Allies share more intelligence than rivals |
| **Intelligence Operations** | Active espionage missions can reveal specific data points |
| **Counter-Intelligence** | Defensive operations reduce what rivals can perceive |

#### 5.2 Information Fidelity

Perceived data has a **fidelity score** (0.0–1.0):
- **1.0:** Perfect accuracy (own country's internal data).
- **0.7–0.9:** Allied intelligence sharing. Accurate but potentially delayed.
- **0.3–0.6:** Open-source intelligence (OSINT). Publicly available but incomplete.
- **0.0–0.3:** Espionage. May be entirely wrong (counter-intelligence disinformation).

#### 5.3 Dense State Serialization (`dumpStateForAnalysis()`) & Background Ticks

To prevent context window explosion and optimize token usage (per `ADR-001`), the AI is **never** presented with the global ground-truth World State (~208 countries). Instead:
- `dumpStateForAnalysis()` (`IStateSerializer`) serializes only locally relevant entities, active crises, and regional neighbors into a dense YAML format.
- All non-local entities (~180+ nations) are simulated asynchronously by the engine in **background ticks**, maintaining macro economic and relational progress without polluting the AI context window.

#### 5.4 Strict Intent Parsing (`IIntentParser`) & Input Validation

All player and agent decisions generated by LLMs are finalized as structured JSON action payloads. Before any action mutates the World State:
1. The `IIntentParser` validates the payload schema and checks action legality against current rules and resource constraints (`Fail Fast`).
2. Validated actions are converted into events and emitted to the `IEventBus`.
3. Hallucinated or invalid actions are rejected immediately, protecting the simulation from state corruption.

### 6. Simulation Domains (Macro Overview)

These domains will be implemented as ECS Systems in Phase 2. This section defines only their **scope and boundaries** — no mechanics, no formulas, no balancing.

#### 6.1 Economy
**Scope:** Production, consumption, trade, markets, currency, debt, inflation, GDP.  
**Inputs:** Region resources, population, infrastructure, trade agreements, sanctions.  
**Outputs:** Events describing economic state changes (price shifts, shortages, surpluses, GDP delta).  
**Boundary:** Does NOT handle military logistics (that's War domain) or political impact of economic failure (that's Politics domain). It emits events that those domains consume.

#### 6.2 War
**Scope:** Military units, combat resolution, logistics, morale, terrain, technology, fuel.  
**Inputs:** Unit components, terrain data, supply lines, technology levels, fuel reserves.  
**Outputs:** Events describing combat results, unit losses, territory changes, supply disruptions.  
**Boundary:** Does NOT decide *why* a war started (that's Diplomacy/Politics). Does NOT produce resources (that's Economy). Consumes economic events for supply/fuel status.

#### 6.3 Politics
**Scope:** Internal factions, popularity, congress/parliament, military loyalty, lobbying, coups.  
**Inputs:** Faction components, economic indicators (via events), war outcomes (via events), public opinion.  
**Outputs:** Events describing policy changes, government stability shifts, faction power changes.  
**Boundary:** Models internal governance only. External relations are Diplomacy. Models *political will* for war, not war execution.

#### 6.4 Diplomacy
**Scope:** Bilateral/multilateral relations, treaties, alliances, sanctions, trade agreements, trust.  
**Inputs:** Relationship components, historical interaction (Timeline queries), agent memory.  
**Outputs:** Events describing diplomatic actions (proposals, acceptances, rejections, violations).  
**Boundary:** Proposes and evaluates agreements. Enforcement is handled by the respective domain (War enforces military alliances, Economy enforces trade agreements).

#### 6.5 Intelligence
**Scope:** SIGINT, HUMINT, OSINT, IMINT, CYBER. Espionage, counter-intelligence, analysis.  
**Inputs:** Intelligence agency components, target country visibility, active operations.  
**Outputs:** `PerceptionUpdate` events that modify an agent's `PerceptionState`. Also: `IntelReport` events consumed by the Agent AI.  
**Boundary:** Does NOT make decisions. It gathers and filters information. The Agent AI consumes intelligence products to make decisions.

---

## Appendix A — Glossary

| Term | Definition |
|------|-----------|
| **Tick** | A single discrete step of simulated time |
| **System** | A stateless processor in the ECS pipeline |
| **Component** | A pure data container attached to an Entity |
| **Entity** | A unique identity (ID) to which Components are attached |
| **Event** | An immutable, typed message published to the Event Bus |
| **Timeline** | The append-only ledger of all events across all ticks |
| **World State** | The current snapshot of all entities and components |
| **Perception State** | An agent's filtered, potentially inaccurate view of the World State |
| **Scenario Pack** | A data package defining a specific geopolitical setting |
| **Snapshot** | A serialized checkpoint of the World State at a specific tick |

## Appendix B — Document Cross-References

| Document | Purpose | Status |
|----------|---------|--------|
| Vision & Game Design (this document) | Engine foundations | Accepted |
| Module Map | Architecture diagram | Accepted |
| Core Contracts | TypeScript interfaces | Accepted |
| [ADR-001: State Management & Context](file:///c:/Projetos/GeoPolis%20AI%20Engine/docs/phase-0/adr/ADR-001-state-and-context-management.md) | Narrative ECS, Geopolitical Context, Seed Data & Intent Validation | Accepted |

