/**
 * @module core/interfaces/component
 * @description Base contract for all ECS Components.
 *
 * Components are pure data containers with no behavior.
 * They must be independently serializable for save game support.
 * Cross-entity relationships use ID references, never object references.
 */

export type ComponentType = string;

/**
 * Base interface for all ECS Components.
 * Components hold only data — no methods, no side effects.
 */
export interface IComponent {
  /** Discriminator for component type resolution at runtime. */
  readonly type: ComponentType;
  readonly [key: string]: unknown;
}

/**
 * Contract for component serialization.
 * Every component must support round-trip serialization for save games and snapshots.
 */
export interface ISerializableComponent<T extends IComponent = IComponent> {
  /** Serialize the component to a JSON-safe plain object. */
  serialize(component: T): Record<string, unknown>;

  /** Deserialize a plain object back into a typed component. */
  deserialize(data: Record<string, unknown>): T;
}
