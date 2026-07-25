/**
 * @module core/interfaces/world-state
 * @description Contract for the World State — the single source of truth
 * for the current simulation state.
 *
 * The World State is read-only during system execution. Mutations occur
 * exclusively during the Event Resolution phase of the Tick Engine,
 * applied through validated events from the Event Bus.
 */

import { IEntity, EntityId } from './entity.interface.js';
import { IComponent, ComponentType } from './component.interface.js';
import { TickNumber } from './event-bus.interface.js';
import { IDenseStateDumpOptions } from './state-serializer.interface.js';

/**
 * Metadata about the current state of the world.
 */
export interface IWorldStateMetadata {
  /** The tick number this state represents. */
  readonly currentTick: TickNumber;

  /** Total number of entities in the world. */
  readonly entityCount: number;

  /** ISO 8601 timestamp of the last state mutation. */
  readonly lastModified: string;

  /** Identifier of the active scenario pack. */
  readonly scenarioId: string;
}

/**
 * The World State contract — current snapshot of all entities and components.
 *
 * @remarks
 * - Read-only during system execution phases.
 * - Mutation methods are restricted to the Event Resolution phase.
 * - Supports entity queries by ID, component type, or combined filters.
 */
export interface IWorldState {
  // ─── Metadata ─────────────────────────────────────────────

  /**
   * Retrieve metadata about the current world state.
   */
  getMetadata(): IWorldStateMetadata;

  // ─── Entity Access ────────────────────────────────────────

  /**
   * Retrieve an entity by its unique identifier.
   * @param id - The entity's unique ID.
   * @returns The entity, or `undefined` if not found.
   */
  getEntity(id: EntityId): IEntity | undefined;

  /**
   * Get all entity IDs currently registered in the world.
   */
  getEntityIds(): ReadonlyArray<EntityId>;

  /**
   * Check whether an entity exists in the world.
   * @param id - The entity's unique ID.
   */
  hasEntity(id: EntityId): boolean;

  /**
   * Retrieve all entities that possess a specific component type.
   * This is the primary query method for ECS Systems.
   * @param componentType - The component type to filter by.
   * @returns A readonly array of matching entities.
   */
  getEntitiesByComponent(componentType: ComponentType): ReadonlyArray<IEntity>;

  /**
   * Retrieve all entities that possess ALL of the specified component types.
   * @param componentTypes - The set of required component types.
   * @returns A readonly array of matching entities.
   */
  getEntitiesByComponents(componentTypes: ReadonlyArray<ComponentType>): ReadonlyArray<IEntity>;

  /**
   * Get the total number of entities in the world.
   */
  getEntityCount(): number;

  /**
   * Fast O(1) relational graph query to get diplomatic relation component edge between source and target entities.
   * @param sourceId - Source country EntityId.
   * @param targetId - Target country EntityId.
   */
  getRelation(sourceId: EntityId, targetId: EntityId): IComponent | undefined;

  // ─── Mutation (Event Resolution Phase Only) ───────────────

  /**
   * Create a new entity and add it to the world.
   * @param id - The unique identifier for the new entity.
   * @param components - Initial components to attach.
   * @throws If an entity with the given ID already exists.
   */
  createEntity(id: EntityId, components: ReadonlyArray<IComponent>): IEntity;

  /**
   * Attach a component to an existing entity.
   * @param entityId - The target entity.
   * @param component - The component to attach.
   * @throws If the entity does not exist or already has a component of this type.
   */
  addComponent(entityId: EntityId, component: IComponent): void;

  /**
   * Replace an existing component on an entity with an updated version.
   * Components are immutable — this replaces the entire component instance.
   * @param entityId - The target entity.
   * @param component - The new component data (same type as the one being replaced).
   * @throws If the entity does not exist or does not have a component of this type.
   */
  updateComponent(entityId: EntityId, component: IComponent): void;

  /**
   * Remove a component from an entity.
   * @param entityId - The target entity.
   * @param componentType - The type of component to remove.
   * @throws If the entity does not exist or does not have a component of this type.
   */
  removeComponent(entityId: EntityId, componentType: ComponentType): void;

  /**
   * Remove an entity and all its components from the world.
   * @param id - The entity to remove.
   * @throws If the entity does not exist.
   */
  removeEntity(id: EntityId): void;

  // ─── Dense Serialization & Fog of War (ADR-001) ───────────

  /**
   * Export a dense, token-optimized string representation of perceived state
   * for an agent operating under Fog of War.
   *
   * @param options - Focal perspective entity and filter configuration.
   * @returns Formatted dense YAML string for LLM AI context.
   */
  dumpStateForAnalysis(options: IDenseStateDumpOptions): string;

  // ─── Snapshot ─────────────────────────────────────────────

  /**
   * Create an immutable snapshot of the current world state.
   * Used for save games and checkpoint restoration.
   * @returns A serializable representation of the entire world state.
   */
  createSnapshot(): IWorldStateSnapshot;

  /**
   * Restore the world state from a previously created snapshot.
   * This replaces the entire current state.
   * @param snapshot - The snapshot to restore from.
   */
  restoreFromSnapshot(snapshot: IWorldStateSnapshot): void;
}

/**
 * An immutable, serializable snapshot of the world state at a point in time.
 */
export interface IWorldStateSnapshot {
  /** The tick at which this snapshot was taken. */
  readonly tick: TickNumber;

  /** ISO 8601 timestamp of snapshot creation. */
  readonly createdAt: string;

  /** Serialized entity and component data. */
  readonly data: Record<string, unknown>;

  /** Integrity hash for validation on restore. */
  readonly hash: string;
}
