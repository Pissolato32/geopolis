import { IComponent, ComponentType } from '../interfaces/component.interface.js';
import { IEntity, EntityId } from '../interfaces/entity.interface.js';
/**
 * Concrete Entity implementation.
 *
 * Internally mutable (addComponent/removeComponent) but exposes
 * a read-only contract via IEntity. Mutation methods are used
 * exclusively by WorldState during the Event Resolution phase.
 */
export declare class Entity implements IEntity {
    readonly id: EntityId;
    private readonly components;
    constructor(id: EntityId, initialComponents?: ReadonlyArray<IComponent>);
    hasComponent(type: ComponentType): boolean;
    getComponent<T extends IComponent>(type: ComponentType): T | undefined;
    getComponentTypes(): ReadonlyArray<ComponentType>;
    /** @internal Attach a component. Throws if type already attached. */
    attachComponent(component: IComponent): void;
    /** @internal Replace a component. Throws if type not attached. */
    replaceComponent(component: IComponent): void;
    /** @internal Detach a component by type. Throws if not attached. */
    detachComponent(type: ComponentType): void;
    /** @internal Get raw component map for serialization. */
    getComponentMap(): ReadonlyMap<ComponentType, IComponent>;
}
//# sourceMappingURL=entity.d.ts.map