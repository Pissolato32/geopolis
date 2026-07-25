---
description: Builds the simulation domains (Economy, War, Politics) using the ECS architecture
---

# Phase 2: Domain Implementation

## Objective
Implement the specific simulation domains (Economy, Diplomacy, War, Politics) as ECS Systems and Components.

## Strict Rules
- **Total Isolation:** Domains MUST NOT access each other directly. 
- **Communication:** Cross-domain interactions must happen EXCLUSIVELY via the Event Bus.
- **No Side Effects:** Components are pure data containers. Systems contain all logic.
- **Determinism:** Calculations within systems must be predictable and repeatable given the same state.

## Output Requirements
- Define clean DDD aggregates where necessary.
- Prioritize clear, expressive naming for Components and Event payloads.