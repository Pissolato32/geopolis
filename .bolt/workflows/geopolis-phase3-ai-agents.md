---
description: Integrates LLM-driven AI agents as political leaders and defines the Fog of War
---

# Phase 3: AI Agents & Fog of War

## Objective
Build the bridge between the Simulation Engine and the AI agents acting as political entities.

## Strict Rules
- **Fog of War:** Agents MUST NOT receive the complete World State. Implement a perspective-filtering mechanism.
- **State Read-Only:** Agents cannot modify the state directly. They must output JSON intended for the Engine.
- **Command Pattern:** Translate parsed JSON from AI into strict Engine Commands.
- **Validation:** Sanitize and validate all agent intents before placing them on the Event Bus.

## Output Requirements
- Create interfaces for Agent Prompts and Expected JSON Schemas.
- Implement robust error handling for hallucinated or invalid AI commands.