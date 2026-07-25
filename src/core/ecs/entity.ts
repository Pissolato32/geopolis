import { IComponent, ComponentType } from '../interfaces/component.interface.js';
import { IEntity, EntityId } from '../interfaces/entity.interface.js';

/**
 * Concrete Entity implementation.
 *
 * Internally mutable (addComponent/removeComponent) but exposes
 * a read-only contract via IEntity. Mutation methods are used
 * exclusively by WorldState during the Event Resolution phase.
 */
export class Entity implements IEntity {
  readonly id: EntityId;
  private readonly components: Map<ComponentType, IComponent> = new Map();

  constructor(id: EntityId, initialComponents: ReadonlyArray<IComponent> = []) {
    this.id = id;
    for (const component of initialComponents) {
      this.components.set(component.type, component);
    }
  }

  hasComponent(type: ComponentType): boolean {
    return this.components.has(type);
  }

  getComponent<T extends IComponent>(type: ComponentType): T | undefined {
    return this.components.get(type) as T | undefined;
  }

  getComponentTypes(): ReadonlyArray<ComponentType> {
    return Array.from(this.components.keys());
  }

  // ─── Internal Mutation (used by WorldState only) ──────────

  /** @internal Attach a component. Throws if type already attached. */
  attachComponent(component: IComponent): void {
    if (this.components.has(component.type)) {
      throw new Error(
        `Entity "${this.id}" already has component of type "${component.type}"`,
      );
    }
    this.components.set(component.type, component);
  }

  /** @internal Replace a component. Throws if type not attached. */
  replaceComponent(component: IComponent): void {
    if (!this.components.has(component.type)) {
      throw new Error(
        `Entity "${this.id}" does not have component of type "${component.type}"`,
      );
    }
    this.components.set(component.type, component);
  }

  /** @internal Detach a component by type. Throws if not attached. */
  detachComponent(type: ComponentType): void {
    if (!this.components.has(type)) {
      throw new Error(
        `Entity "${this.id}" does not have component of type "${type}"`,
      );
    }
    this.components.delete(type);
  }

  /** @internal Get raw component map for serialization. */
  getComponentMap(): ReadonlyMap<ComponentType, IComponent> {
    return this.components;
  }
}
