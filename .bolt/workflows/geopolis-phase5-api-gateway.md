---
description: Builds the headless API gateway (REST/WebSockets) for external clients
---

# Phase 5: API Gateway & Headless Exposure

## Objective
Wrap the completed Simulation Engine in an API layer so external clients can interact with it.

## Strict Rules
- **No Engine Logic:** This layer MUST NOT contain any simulation logic. It is strictly a translation and routing layer.
- **Protocol Agnostic:** Design controllers that can handle both REST (snapshots/commands) and WebSockets (real-time Tick streaming).
- **Security Validation:** Validate external payloads strictly before converting them to Internal Commands.

## Output Requirements
- Use standard HTTP status codes and clear error messages.
- Provide clear Data Transfer Object (DTO) definitions.