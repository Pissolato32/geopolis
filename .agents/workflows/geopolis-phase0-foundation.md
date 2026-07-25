---
description: Generates the Vision Document, GDD, and Module Map of the simulation engine for Phase 0. temperature: 0.1
---

# Step 1 - Engine Vision Document and GDD
Initiating GeoPolis Phase 0.
Act as the Chief Architect. Write the "Vision and Game Design Document (Core Engine)".
The document must focus on the concept of an agnostic "Simulation Engine" (where the scenario is just a data layer).
Define the pillars: Tick Engine, Event Bus, and State Persistence (Timeline/Append-only).
Do NOT create game mechanics yet. Focus on the engine.

# Step 2 - Module Map (Diagram)
Based on the approved Vision Document, generate a Mermaid diagram listing the Engine's Module Map.
Show how the 'Event Bus' centralizes communication between modules (Economy, AI, Politics, War, Diplomacy) ensuring low coupling.

# Step 3 - Core Initial Contracts
Generate the strict initial interfaces for the engine's core:
- `IEventBus` (Pub/Sub system)
- `IGameState` (Persistence)
- `ISimulationTick` (Tick loop)
Do NOT provide concrete implementations, only signatures, types, and interface documentation (TSDoc/Docstrings).