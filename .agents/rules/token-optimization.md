---
trigger: always_on
---

# Token Optimization Rules
# Objective: Minimize token usage and maximize context relevance (ADR-001 Compliant).

## Context Injection
- Inject ONLY interfaces (`.interface.ts`), NEVER concrete implementations for dependencies.
- Rely exclusively on typed contracts for reasoning.

## Session Isolation
- NO megathreads. Restart sessions per isolated task.
- Limit context to: global rules, active workflow, and strictly necessary files.
- NEVER carry stale refactoring history.

## Output Economy
- NEVER output full files for minor edits. Use strict diff/patch blocks.
- Return ONLY modified code blocks.

## State Payload & Fog of War (ADR-001)
- Never expose the global ground-truth World State (~208 entities/nations) to the AI.
- Use `dumpStateForAnalysis()` (`IStateSerializer`) to generate dense YAML payloads containing only entities, crises, and nations relevant to the agent's local scope/action.
- Non-relevant world state must be processed asynchronously by the engine in background ticks.
- Strip UUIDs, internal engine metadata, and raw timestamps from AI context dumps.

## LLM Input Validation & Intent Parsing (ADR-001)
- All LLM actions must be returned as a compact JSON action payload.
- The `IIntentParser` validates LLM payloads before pushing events to `IEventBus` (`Fail Fast`).
- Hallucinated or invalid actions are rejected immediately without mutating state.

## Documentation Navigation
- Default index: `docs/phase-0/module-map.md`.
- Load specific domain docs (`docs/domains/[name].md`) ONLY when actively modifying them.
- Reference `docs/phase-0/adr/ADR-001-state-and-context-management.md` for state and context decisions.