# ADR-006: Canonical Political Ontology and Dynamic Regime Transitions

> **Status:** Proposed  
> **Date:** 2026-08-16  
> **Deciders:** GeoPolis project maintainers  
> **Complements:** ADR-001 (State & Context Management), ADR-005 (Current ECS Architecture Consolidation)

---

## Context

During early development, political concepts (regime types, internal factions, legislative support, and government stability) were represented using overlapping taxonomies across legacy scripts, UI types, and initial simulation drafts.

With the consolidation of the canonical simulation engine in `src/engine/domain/politics/` (Phase 4), a strict Entity-Component-System (ECS) political domain was introduced. To avoid domain leaks, magic narrative scripts, or conflicting regime definitions between the simulation engine, AI agents, and the UI, a single canonical political ontology and transition model must be formally documented and enforced across the repository.

## Decision

### 1. Canonical Government Taxonomy

The simulation engine defines seven canonical government types (`GovernmentType` in `src/engine/domain/politics/components/politics.components.ts`):

- `democracy`: Multiparty democratic republic or parliamentary democracy with competitive elections.
- `constitutional-monarchy`: Parliamentary system with a symbolic monarch and democratic assembly.
- `authoritarian`: Autocracy, dictatorship, or dominant-party regime with restricted political competition.
- `one-party`: Single-party state or totalitarian regime.
- `military-junta`: Military council governance resulting from armed forces intervention.
- `theocracy`: Religious leadership or clerical council governance.
- `monarchy`: Absolute monarchy without constitutional constraints.

### 2. Canonical Internal Factions

Internal political dynamics are driven by four core faction archetypes (`FactionType`):

- `military-brass`: Armed forces high command, officer corps, and defense establishment.
- `oligarchs-industrialists`: Business elites, corporate leaders, energy barons, and industrial magnates.
- `technocrats`: Civil service bureaucrats, economic planners, central bankers, and policy experts.
- `populists-labor`: Organized labor unions, grassroots movements, and populist political bases.

### 3. ECS Political Components

Political state is anchored in three strict ECS components attached to country entities (`IEntity`):

1. **`GovernmentStabilityComponent` (`politics.stability`)**:
   - `stabilityIndex`: Normalized scale from 0.0 (anarchy/collapse) to 1.0 (total control).
   - `approvalRating`: Public approval index (0.0 to 1.0).
   - `militaryLoyalty`: Loyalty of armed forces to the current regime (0.0 to 1.0).
   - `governmentType`: One of the seven canonical `GovernmentType` values.
   - `regimeStabilityTicks`: Duration (in ticks) the current regime has maintained power.

2. **`PoliticalFactionComponent` (`politics.faction`)**:
   - `factionType`: One of the four canonical `FactionType` values.
   - `factionName`: Display name for UI/narrative context.
   - `powerShare`: Relative political power (0-100%).
   - `loyaltyIndex`: Faction loyalty to the head of state/government (0-100%).
   - `ideology`: Ideological label (e.g. `nationalist`, `technocrat`, `populist`).
   - `isGovernmentInPower`: Boolean indicating if the faction holds the executive mandate.

3. **`LegislativeAssemblyComponent` (`politics.legislative-assembly`)**:
   - `supportLevel`: Assembly support level for the current government (0-100%).
   - `warSupport`: Legislative readiness/approval for military operations (0-100%).
   - `taxHikeSupport`: Support for fiscal expansion/tax rate increases (0-100%).
   - `seatsTotal`, `seatsGovernment`, `seatsOpposition`: Seat distribution math.

### 4. Political Systems & Regime Transition Architecture

#### Implemented Systems (Current State)

- **`PoliticsSystem` (`politics.system`, Priority 300)**:
  - Evaluates government stability during tick execution.
  - Applies stability impacts from economic resource shortages and war exhaustion.
  - Updates internal faction power and loyalty dynamics.
  - Maintains legislative assembly support for democratic and constitutional regimes.
  - Provides deterministic legislative approval checks for war declarations and tax hikes.
  - Emits `politics.stability-changed`, `politics.coup-risk`, and faction influence events.

- **Coup and regime-transition contracts**:
  - The political event layer defines typed contracts for coup d'état and regime-change events.
  - These contracts establish the canonical integration surface for future regime-transition implementations.
  - The existence of these event contracts does not imply that a complete automatic coup-resolution or dynamic regime-transition system is currently implemented.

#### Canonical Event Contracts

All political events use the exact string identifiers defined in `src/engine/domain/politics/events/politics.events.ts`:

- `politics.stability-changed` (`POLITICS_STABILITY_CHANGED_EVENT`)
- `politics.coup-risk` (`POLITICS_COUP_RISK_EVENT`)
- `politics.coup-d-etat` (`POLITICS_COUP_DE_ETAT_EVENT`)
- `politics.faction-influence-changed` (`POLITICS_FACTION_INFLUENCE_EVENT`)
- `politics.legislative-vote` (`POLITICS_LEGISLATIVE_VOTE_EVENT`)
- `politics.regime-change` (`POLITICS_REGIME_CHANGE_EVENT`)

#### Future Regime Transition Guidelines (Architectural Decision)

- Future political transition mechanisms, such as democratic elections, popular revolutions, coups d'état, or constitutional reforms, must be implemented as deterministic ECS systems within `src/engine/domain/politics/systems/`.
- Transition systems must treat `GovernmentStabilityComponent` as the authoritative political state.
- Regime transitions must emit `POLITICS_REGIME_CHANGE_EVENT` through the `EventBus`.
- Cross-domain consequences must be communicated through typed events rather than direct coupling between political and other domain systems.
- Political decisions or policy changes initiated by AI agents or external clients must pass through the `StrictIntentParser` before producing simulation effects.

## Consequences

### Positive

- Establishes a single, unambiguous political ontology across the engine, AI agents, and UI presentation layer.
- Aligns documentation precisely with existing implementation in `src/engine/domain/politics/`.
- Enforces strict ECS architecture and EventBus isolation as mandated by ADR-001 and ADR-005.

### Negative

- Any new political mechanics or UI features must strictly conform to these interfaces (`GovernmentType`, `FactionType`, components) without introducing arbitrary string types or ad-hoc properties.
