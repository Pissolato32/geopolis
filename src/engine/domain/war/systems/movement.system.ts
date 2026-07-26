import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import {
  MILITARY_UNIT_TYPE,
  MilitaryUnitComponent,
} from '../components/war.components.js';
import {
  PROVINCE_TYPE,
  ProvinceComponent,
  ProvinceData,
} from '../components/province.components.js';
import { getTerrainModifiers, TerrainType } from '../components/terrain.components.js';
import {
  WAR_UNIT_MOVED_EVENT,
  WAR_MOVE_ORDERED_EVENT,
  WAR_FUEL_CONSUMED_EVENT,
  IWarUnitMovedPayload,
  IWarMoveOrderedPayload,
  IWarFuelConsumedPayload,
} from '../events/war.events.js';

export const MOVEMENT_SYSTEM_ID = 'war.movement';

const BASE_FUEL_PER_MOVE = 1;

export class MovementSystem implements ISystem {
  readonly descriptor = {
    id: MOVEMENT_SYSTEM_ID,
    name: 'Military Movement System',
    priority: 475 as SystemPriority,
    requiredComponents: [MILITARY_UNIT_TYPE],
    subscribedEvents: [WAR_MOVE_ORDERED_EVENT, WAR_UNIT_MOVED_EVENT],
    emittedEvents: [WAR_UNIT_MOVED_EVENT, WAR_FUEL_CONSUMED_EVENT],
  };

  initialize(eventBus: IEventBus, worldState?: IWorldState): void {
    if (!worldState) return;

    eventBus.subscribe<IWarMoveOrderedPayload>(
      WAR_MOVE_ORDERED_EVENT,
      (event) => {
        const unitId = event.payload.unitId as EntityId;
        if (worldState.hasEntity(unitId)) {
          const entity = worldState.getEntity(unitId);
          const currentComp = entity?.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
          if (currentComp) {
            worldState.updateComponent(unitId, {
              ...currentComp,
              moveTargetProvinceId: event.payload.targetProvinceId,
              moveProgress: 0,
            } as unknown as IComponent);
          }
        }
      },
    );

    eventBus.subscribe<IWarUnitMovedPayload>(
      WAR_UNIT_MOVED_EVENT,
      (event) => {
        const unitId = event.payload.unitId as EntityId;
        if (worldState.hasEntity(unitId)) {
          const entity = worldState.getEntity(unitId);
          const currentComp = entity?.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
          if (currentComp) {
            const targetReached = currentComp.moveTargetProvinceId === event.payload.toProvinceId;
            worldState.updateComponent(unitId, {
              ...currentComp,
              currentProvinceId: event.payload.toProvinceId,
              moveProgress: targetReached ? 100 : Math.min((currentComp.moveProgress ?? 0) + 20, 99),
              moveTargetProvinceId: targetReached ? undefined : currentComp.moveTargetProvinceId,
            } as unknown as IComponent);
          }
        }
      },
    );
  }

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const units = state.getEntitiesByComponent(MILITARY_UNIT_TYPE);
    const provinceGraph = this.buildProvinceGraph(state);

    for (const unit of units) {
      const mil = unit.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
      if (!mil) continue;
      if (!mil.moveTargetProvinceId) continue;
      if (mil.fuelReserves <= 0) continue;

      const from = mil.currentProvinceId;
      const target = mil.moveTargetProvinceId;

      if (target === from) {
        eventBus.publish<IWarUnitMovedPayload>(
          WAR_UNIT_MOVED_EVENT,
          { unitId: unit.id, ownerCountryId: mil.ownerCountryId, fromProvinceId: from, toProvinceId: target },
          MOVEMENT_SYSTEM_ID,
          unit.id,
        );
        continue;
      }

      const neighbors = provinceGraph.get(from);
      if (!neighbors || neighbors.length === 0) continue;

      let nextProvinceId: string;

      if (neighbors.includes(target)) {
        nextProvinceId = target;
      } else {
        const step = this.bfsNextStep(from, target, provinceGraph);
        if (!step) continue;
        nextProvinceId = step;
      }

      const destTerrain = this.getProvinceTerrain(state, nextProvinceId);
      const terrainCost = getTerrainModifiers(destTerrain).movementCostMultiplier;
      const fuelCost = Math.ceil(BASE_FUEL_PER_MOVE * terrainCost);
      const newFuel = Math.max(0, mil.fuelReserves - fuelCost);

      eventBus.publish<IWarFuelConsumedPayload>(
        WAR_FUEL_CONSUMED_EVENT,
        { unitId: unit.id, previousFuel: mil.fuelReserves, newFuel },
        MOVEMENT_SYSTEM_ID,
        unit.id,
      );

      eventBus.publish<IWarUnitMovedPayload>(
        WAR_UNIT_MOVED_EVENT,
        {
          unitId: unit.id,
          ownerCountryId: mil.ownerCountryId,
          fromProvinceId: from,
          toProvinceId: nextProvinceId,
        },
        MOVEMENT_SYSTEM_ID,
        unit.id,
      );
    }
  }

  private getProvinceTerrain(state: Readonly<IWorldState>, provinceId: string): TerrainType {
    for (const eid of state.getEntityIds()) {
      const entity = state.getEntity(eid);
      if (!entity) continue;
      const provComp = entity.getComponent<ProvinceComponent>(PROVINCE_TYPE);
      if (!provComp) continue;
      const prov = (provComp.provinces as ReadonlyArray<ProvinceData>).find((p) => p.provinceId === provinceId);
      if (prov) return prov.terrain;
    }
    return 'plains';
  }

  private buildProvinceGraph(state: Readonly<IWorldState>): Map<string, ReadonlyArray<string>> {
    const graph = new Map<string, ReadonlyArray<string>>();

    for (const eid of state.getEntityIds()) {
      const entity = state.getEntity(eid);
      if (!entity) continue;
      const provComponent = entity.getComponent<ProvinceComponent>(PROVINCE_TYPE);
      if (!provComponent) continue;
      for (const prov of provComponent.provinces as ReadonlyArray<ProvinceData>) {
        graph.set(prov.provinceId, prov.neighborIds);
      }
    }

    return graph;
  }

  private bfsNextStep(
    from: string,
    target: string,
    graph: Map<string, ReadonlyArray<string>>,
  ): string | undefined {
    const visited = new Set<string>([from]);
    const queue: Array<{ id: string; firstStep: string }> = [];

    for (const neighbor of graph.get(from) ?? []) {
      if (neighbor === target) return target;
      queue.push({ id: neighbor, firstStep: neighbor });
      visited.add(neighbor);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.id === target) return current.firstStep;
      for (const neighbor of graph.get(current.id) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ id: neighbor, firstStep: current.firstStep });
        }
      }
    }

    return undefined;
  }
}
