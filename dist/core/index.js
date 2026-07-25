/**
 * @module core
 * @description Barrel export for the GeoPolis Core Engine.
 *
 * Re-exports all interfaces, components, DTOs, utilities, and concrete implementations.
 */
// ─── Utilities ──────────────────────────────────────────────
export { DenseFormatter } from './utils/dense-formatter.js';
// ─── Implementations ────────────────────────────────────────
export { Entity } from './ecs/entity.js';
export { EventBus } from './event-bus/event-bus.js';
export { Timeline } from './timeline/timeline.js';
export { WorldState } from './world-state/world-state.js';
export { TickEngine } from './tick-engine/tick-engine.js';
//# sourceMappingURL=index.js.map