import { IComponent, ComponentType } from '../interfaces/component.interface.js';
import { IEntity, EntityId } from '../interfaces/entity.interface.js';
import { IWorldState, IWorldStateMetadata, IWorldStateSnapshot } from '../interfaces/world-state.interface.js';
import { TickNumber } from '../interfaces/event-bus.interface.js';
import { IDenseStateDumpOptions } from '../interfaces/state-serializer.interface.js';
/**
 * Concrete World State implementation — entity registry with component indices.
 *
 * Read-only during system execution. Mutations are performed exclusively
 * during the Event Resolution phase of the Tick Engine.
 */
export declare class WorldState implements IWorldState {
    private readonly entities;
    private readonly componentIndex;
    private readonly relationGraphIndex;
    private currentTick;
    private lastModified;
    private readonly scenarioId;
    constructor(scenarioId: string);
    getMetadata(): IWorldStateMetadata;
    /** @internal Update the current tick. Called by TickEngine. */
    setCurrentTick(tick: TickNumber): void;
    getEntity(id: EntityId): IEntity | undefined;
    hasEntity(id: EntityId): boolean;
    getEntityIds(): ReadonlyArray<EntityId>;
    getEntitiesByComponent(componentType: ComponentType): ReadonlyArray<IEntity>;
    getEntitiesByComponents(componentTypes: ReadonlyArray<ComponentType>): ReadonlyArray<IEntity>;
    getEntityCount(): number;
    createEntity(id: EntityId, components?: ReadonlyArray<IComponent>): IEntity;
    addComponent(entityId: EntityId, component: IComponent): void;
    private maybeCreateMirrorRelation;
    updateComponent(entityId: EntityId, component: IComponent): void;
    removeComponent(entityId: EntityId, componentType: ComponentType): void;
    removeEntity(id: EntityId): void;
    dumpStateForAnalysis(options: IDenseStateDumpOptions): string;
    private computeVisibleEntities;
    createSnapshot(): IWorldStateSnapshot;
    restoreFromSnapshot(snapshot: IWorldStateSnapshot): void;
    getRelation(sourceId: EntityId, targetId: EntityId): IComponent | undefined;
    private getEntityOrThrow;
    private indexComponent;
    private deindexComponent;
    private markModified;
}
//# sourceMappingURL=world-state.d.ts.map