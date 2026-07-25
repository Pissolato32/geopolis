/**
 * @module core
 * @description Barrel export for the GeoPolis Core Engine.
 *
 * Re-exports all interfaces, components, DTOs, utilities, and concrete implementations.
 */

// ─── Interfaces & DTOs ──────────────────────────────────────
export type {
  IComponent,
  ComponentType,
  ISerializableComponent,
  IEntity,
  EntityId,
  ISimulationEvent,
  ITypedEvent,
  IEventBus,
  EventHandler,
  EventId,
  TickNumber,
  SubscriptionToken,
  ITimeline,
  ITimelineEntry,
  ITimelineQuery,
  IWorldState,
  IWorldStateMetadata,
  IWorldStateSnapshot,
  ISystem,
  ISystemDescriptor,
  SystemPriority,
  ITickEngine,
  ITickEngineConfig,
  ITickResult,
  ITickLifecycleHooks,
  IStateSerializer,
  IDenseStateDumpOptions,
  IIntentParser,
  IActionPayload,
  IValidationResult,
  IWorldSeed,
  IRelationSeed,
  IEntitySeed,
  DemographicViewDTO,
  EconomicViewDTO,
  MilitaryViewDTO,
} from './interfaces/index.js';

// ─── Core Mathematical Components ───────────────────────────
export type {
  IDemographicComponent,
  IEconomicComponent,
  IMilitaryComponent,
} from './components/index.js';

// ─── Utilities ──────────────────────────────────────────────
export { DenseFormatter } from './utils/dense-formatter.js';

// ─── Implementations ────────────────────────────────────────
export { Entity } from './ecs/entity.js';
export { EventBus } from './event-bus/event-bus.js';
export { Timeline } from './timeline/timeline.js';
export { WorldState } from './world-state/world-state.js';
export { TickEngine } from './tick-engine/tick-engine.js';
