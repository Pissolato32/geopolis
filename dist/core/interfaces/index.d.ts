/**
 * @module core/interfaces
 * @description Barrel export for all core engine contracts.
 *
 * Import from this index to access any core interface:
 * ```typescript
 * import { IEventBus, IWorldState, ITickEngine } from './core/interfaces';
 * ```
 */
export type { IComponent, ComponentType, ISerializableComponent } from './component.interface.js';
export type { IEntity, EntityId } from './entity.interface.js';
export type { ISimulationEvent, ITypedEvent, IEventBus, EventHandler, EventId, TickNumber, SubscriptionToken, } from './event-bus.interface.js';
export type { ITimeline, ITimelineEntry, ITimelineQuery } from './timeline.interface.js';
export type { IWorldState, IWorldStateMetadata, IWorldStateSnapshot, } from './world-state.interface.js';
export type { ISystem, ISystemDescriptor, SystemPriority, } from './system.interface.js';
export type { ITickEngine, ITickEngineConfig, ITickResult, ITickLifecycleHooks, } from './tick-engine.interface.js';
export type { IStateSerializer, IDenseStateDumpOptions, } from './state-serializer.interface.js';
export type { IIntentParser, IActionPayload, IValidationResult, } from './intent-parser.interface.js';
export type { IWorldSeed, IRelationSeed, IEntitySeed, } from './world-seed.interface.js';
export type { IDeltaSeedPayload, IPatchEntity, ISanitizationReport, } from './seed-delta.interface.js';
export type { DemographicViewDTO, EconomicViewDTO, MilitaryViewDTO, } from './dto/index.js';
//# sourceMappingURL=index.d.ts.map