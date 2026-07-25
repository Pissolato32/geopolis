/**
 * Concrete Entity implementation.
 *
 * Internally mutable (addComponent/removeComponent) but exposes
 * a read-only contract via IEntity. Mutation methods are used
 * exclusively by WorldState during the Event Resolution phase.
 */
export class Entity {
    id;
    components = new Map();
    constructor(id, initialComponents = []) {
        this.id = id;
        for (const component of initialComponents) {
            this.components.set(component.type, component);
        }
    }
    hasComponent(type) {
        return this.components.has(type);
    }
    getComponent(type) {
        return this.components.get(type);
    }
    getComponentTypes() {
        return Array.from(this.components.keys());
    }
    // ─── Internal Mutation (used by WorldState only) ──────────
    /** @internal Attach a component. Throws if type already attached. */
    attachComponent(component) {
        if (this.components.has(component.type)) {
            throw new Error(`Entity "${this.id}" already has component of type "${component.type}"`);
        }
        this.components.set(component.type, component);
    }
    /** @internal Replace a component. Throws if type not attached. */
    replaceComponent(component) {
        if (!this.components.has(component.type)) {
            throw new Error(`Entity "${this.id}" does not have component of type "${component.type}"`);
        }
        this.components.set(component.type, component);
    }
    /** @internal Detach a component by type. Throws if not attached. */
    detachComponent(type) {
        if (!this.components.has(type)) {
            throw new Error(`Entity "${this.id}" does not have component of type "${type}"`);
        }
        this.components.delete(type);
    }
    /** @internal Get raw component map for serialization. */
    getComponentMap() {
        return this.components;
    }
}
//# sourceMappingURL=entity.js.map