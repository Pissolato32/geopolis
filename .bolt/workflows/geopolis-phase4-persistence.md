---
description: Implements the append-only state, snapshots, and data serialization
---

# Phase 4: Persistence & State

## Objective
Establish the mechanisms to save, load, and audit the entire simulation state.

## Strict Rules
- **Append-Only Timeline:** The historical state must be immutable. Store events as an append-only log.
- **Snapshots:** Implement mechanisms to generate lightweight state snapshots at specific Ticks.
- **Serialization:** Ensure all Entities, Components, and Events are safely serializable to/from JSON.
- **Rehydration:** The Engine must be able to resume a simulation perfectly from any valid snapshot.

## Output Requirements
- Avoid circular references in Component data to prevent serialization crashes.
- Optimize memory usage for long-running simulation timelines.