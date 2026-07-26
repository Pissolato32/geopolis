---
description: Scaffolds standard ECS boilerplate (Entities, Components, Systems)
---

# ECS Scaffolder Utility

## Objective
Rapidly generate boilerplate code for new ECS elements adhering to project standards.

## Strict Rules
- **Component Pattern:** Generate classes/interfaces that only hold state (no methods).
- **System Pattern:** Generate classes implementing the `ISystem` interface with an `update(tick)` method.
- **Registration:** Output instructions or automated scripts on how to register the new system/component in the central Engine registry.
- **Imports:** Use correct relative paths and existing core interfaces.

## Output Requirements
- Do not invent new architectural patterns. Mirror existing ECS modules exactly.
- Keep output concise and ready to copy-paste or save.