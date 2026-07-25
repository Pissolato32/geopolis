/**
 * @module core/interfaces/entity
 * @description Base contract for all ECS Entities.
 *
 * Entities are identity containers — unique IDs to which Components are attached.
 * They carry no data and no behavior of their own.
 */
import { IComponent, ComponentType } from './component.interface.js';
/** Opaque unique identifier for an entity instance. */
export type EntityId = string & {
    readonly __brand: unique symbol;
};
/**
 * Represents a single entity in the ECS world.
 * An entity is purely an identity with an attached set of components.
 */
export interface IEntity {
    /** Globally unique, immutable identifier. */
    readonly id: EntityId;
    /**
     * Check whether this entity has a component of the given type.
     * @param type - The component type discriminator.
     * @returns `true` if the component is attached.
     */
    hasComponent(type: ComponentType): boolean;
    /**
     * Retrieve a component by type.
     * @param type - The component type discriminator.
     * @returns The component instance, or `undefined` if not attached.
     */
    getComponent<T extends IComponent>(type: ComponentType): T | undefined;
    /**
     * Return all component types currently attached to this entity.
     * @returns A readonly array of component type discriminators.
     */
    getComponentTypes(): ReadonlyArray<ComponentType>;
}
//# sourceMappingURL=entity.interface.d.ts.map