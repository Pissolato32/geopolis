# ADR 002: Bring Your Own Data (BYOD) World Seed Initialization

> **Status:** Accepted  
> **Date:** 2026-07-24  
> **Deciders:** Chief Architect, Lead Game Designer, Lead Systems Engineer  
> **Context Area:** Core Engine, Persistence, Scenario Seeding, LLM Integration

---

## Context

To initialize "Tick 0" of a campaign with the real-world contemporary geopolitical state on any arbitrary date without locking the engine to hardcoded dates or requiring paid native runtime API calls, GeoPolis needs a decoupled data initialization strategy.

Directly asking an external LLM to generate the complete ground-truth world state (~208 countries, hundreds of relational edges, economic indicators, and military inventories) in a single prompt introduces three major risks:

1. **Token Truncation:** Complete world states exceed standard LLM chat output limits (~4096 tokens), resulting in broken or truncated JSON.
2. **ID Hallucination:** External LLMs use non-canonical country names or IDs (e.g., `"USA"`, `"EUA"`, `"country-usa"`) instead of the engine's canonical IDs (`"country-us"`).
3. **Out-of-Bounds Values:** LLMs frequently format percentages as whole numbers (e.g., `85` or `85%` instead of `0.85`), breaking deterministic mathematical formulas in `TickEngine`.

---

## Decision

We adopt the **Bring Your Own Data (BYOD) Decoupled Initialization Pattern**:

### 1. Base Seed + Compact Delta Patch
- A pre-packaged base seed (`world-base.json`) provides canonical IDs for all ~208 countries, static geography, and default baseline indicators.
- The `SeedPromptGenerator` produces a structured prompt for the player to copy into an external web LLM (ChatGPT, DeepSeek, Claude, etc.).
- The LLM is instructed to generate **only** a compact `IDeltaSeedPayload` (< 2000 tokens) detailing active geopolitical events, recent crises, or modified indicators for the current date.

### 2. Robust Fault-Tolerant Sanitization (`SeedSanitizer`)
- **Alias Table Resolution:** Mapeia ISO-3166 codes and common country names (`"USA"`, `"EUA"`, `"country-usa"`, `"United States"`) to canonical engine IDs (`"country-us"`).
- **Auto-Clamping & Fraction Normalization:** Automatically converts percentages and scaled numbers (`85%` or `85` -> `0.85`).
- **Property-Level Fallback:** Corrupted properties or unparseable fields are safely dropped while retaining base seed defaults instead of rejecting the import.

### 3. Fail-Safe Delta Merging (`loadWorldSeed`)
- The engine applies the sanitized Delta Patch on top of the Base Seed state before starting Tick 0.
- Every import produces an `ISanitizationReport` logging all applied alias resolutions, clamped values, and dropped fields.

---

## Consequences

### Positive
- **Zero Runtime API Cost:** Players can use any web-based LLM of their choice for free.
- **Zero Token Truncation:** Delta payloads are lightweight (< 2000 tokens) and fit safely within output windows.
- **Robust Math Safety:** `SeedSanitizer` guarantees all numerical components fit strict mathematical bounds before `TickEngine` execution.

### Negative
- **Player UX Step:** Requires a manual copy-paste step from the game UI to the web browser and back.
