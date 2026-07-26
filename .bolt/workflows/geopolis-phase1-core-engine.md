---
description: Implements the Phase 1 Core Engine architecture (Tick Engine, Event Bus, ECS base). temperature: 0.1
---

# Phase 1: Core Engine Implementation

## Objective
Build the foundational agnostic simulation infrastructure. This phase focuses entirely on mechanics, loops, and memory management.

## Strict Rules
- **No Domain Logic:** Do NOT implement any specific game mechanics (e.g., economy, war). This is strictly the engine core.
- **Event-Driven:** Implement a robust, strongly-typed Pub/Sub Event Bus.
- **Tick Engine:** Establish a deterministic game loop (Tick system) to process ECS Systems.
- **ECS Infrastructure:** Define the base abstract classes/interfaces for Entities, Components, and Systems.

## Output Requirements
- Use strict TypeScript interfaces.
- Ensure 100% test coverage for the Event Bus and Tick Engine mechanisms.
- Fail fast on invalid states.