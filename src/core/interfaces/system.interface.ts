/**
 * @module core/interfaces/system
 * @description Contract for ECS Systems — stateless processors that iterate
 * over entities, read state, compute consequences, and emit events.
 *
 * Systems are the behavioral backbone of the simulation. They encapsulate
 * all domain logic while maintaining strict separation from state mutation.
 */

import { IWorldState } from './world-state.interface.js';
import { IEventBus } from './event-bus.interface.js';
import { ComponentType } from './component.interface.js';

/** Execution priority for system ordering. Lower values execute first. */
export type SystemPriority = number & { readonly __brand: unique symbol };

/**
 * Metadata describing a system's identity and dependencies.
 * Used by the Tick Engine for scheduling and validation.
 */
export interface ISystemDescriptor {
  /** Unique identifier for this system (e.g., "economy.trade-resolution"). */
  readonly id: string;

  /** Human-readable name for debugging and logging. */
  readonly name: string;

  /** Execution priority within a tick. Lower values execute first. */
  readonly priority: SystemPriority;

  /**
   * Component types this system queries from the World State.
   * The Tick Engine uses this for validation and potential optimization.
   */
  readonly requiredComponents: ReadonlyArray<ComponentType>;

  /**
   * Event types this system subscribes to.
   * Declared for dependency analysis and documentation.
   */
  readonly subscribedEvents: ReadonlyArray<string>;

  /**
   * Event types this system may emit.
   * Declared for dependency analysis and documentation.
   */
  readonly emittedEvents: ReadonlyArray<string>;
}

/**
 * The System contract — a stateless processor in the ECS pipeline.
 *
 * @remarks
 * - A system READS from World State (via component queries).
 * - A system EMITS events to the Event Bus.
 * - A system NEVER mutates World State directly.
 * - A system NEVER calls another system.
 * - A system MUST be deterministic given identical inputs.
 */
export interface ISystem {
  /**
   * The system's metadata descriptor.
   * Provides identity, priority, and dependency declarations.
   */
  readonly descriptor: ISystemDescriptor;

  /**
   * Execute this system for the current tick.
   *
   * The system reads the current World State, processes relevant entities,
   * and emits events describing the consequences of its computations.
   *
   * @param state - Read-only access to the current World State.
   * @param eventBus - The Event Bus for publishing events.
   */
  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void;

  /**
   * Optional initialization hook called once when the system is registered.
   * Use for subscribing to event types on the Event Bus and binding state mutation handlers.
   *
   * @param eventBus - The Event Bus for subscribing to events.
   * @param worldState - The World State for applying validated state mutations during flush.
   */
  initialize?(eventBus: IEventBus, worldState?: IWorldState): void;

  /**
   * Optional teardown hook called when the system is unregistered.
   * Use for cleanup of subscriptions or resources.
   */
  teardown?(): void;
}
