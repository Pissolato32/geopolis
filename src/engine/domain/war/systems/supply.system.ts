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
  SUPPLY_STATUS_TYPE,
  SupplyStatusComponent,
  SupplyLevel,
} from '../components/province.components.js';
import { getTerrainModifiers, TerrainType } from '../components/terrain.components.js';
import {
  WAR_SUPPLY_CUT_EVENT,
  WAR_SUPPLY_RESTORED_EVENT,
  IWarSupplyCutPayload,
  IWarSupplyRestoredPayload,
} from '../events/war-terrain.events.js';
import { WAR_FUEL_DEPLETED_EVENT, IWarFuelDepletedPayload } from '../events/war.events.js';

export const SUPPLY_SYSTEM_ID = 'war.supply';

const MAX_SUPPLY_DISTANCE = 5;
const DEGRADED_THRESHOLD = 3;
const SUPPLY_FILL_RATE = 2;
const SUPPLY_DEGRADE_PENALTY = 0.05;

export class SupplySystem implements ISystem {
  readonly descriptor = {
    id: SUPPLY_SYSTEM_ID,
    name: 'Supply Line System',
    priority: 455 as SystemPriority,
    requiredComponents: [MILITARY_UNIT_TYPE],
    subscribedEvents: [WAR_FUEL_DEPLETED_EVENT],
    emittedEvents: [WAR_SUPPLY_CUT_EVENT, WAR_SUPPLY_RESTORED_EVENT],
  };

  initialize(eventBus: IEventBus, worldState?: IWorldState): void {
    if (!worldState) return;

    eventBus.subscribe<IWarFuelDepletedPayload>(
      WAR_FUEL_DEPLETED_EVENT,
      (event) => {
        const unitId = event.payload.unitId as EntityId;
        if (!worldState.hasEntity(unitId)) return;
        const entity = worldState.getEntity(unitId);
        const mil = entity?.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
        if (!mil) return;
        worldState.updateComponent(unitId, {
          ...mil,
          readiness: Math.max(0, mil.readiness - event.payload.readinessPenalty),
        } as unknown as IComponent);
      },
    );

    eventBus.subscribe<{ unitId: string; previousFuel: number; newFuel: number }>(
      'war.fuel-consumed',
      (event) => {
        if (event.sourceSystem === SUPPLY_SYSTEM_ID) {
          const unitId = event.payload.unitId as EntityId;
          if (!worldState.hasEntity(unitId)) return;
          const entity = worldState.getEntity(unitId);
          const mil = entity?.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
          if (!mil) return;
          worldState.updateComponent(unitId, {
            ...mil,
            fuelReserves: event.payload.newFuel,
          } as unknown as IComponent);
        }
      },
    );

    eventBus.subscribe<{ unitId: string; readiness: number; morale: number }>(
      'war.supply-degraded',
      (event) => {
        if (event.sourceSystem !== SUPPLY_SYSTEM_ID) return;
        const unitId = event.payload.unitId as EntityId;
        if (!worldState.hasEntity(unitId)) return;
        const entity = worldState.getEntity(unitId);
        const mil = entity?.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
        if (!mil) return;
        worldState.updateComponent(unitId, {
          ...mil,
          readiness: event.payload.readiness,
          morale: event.payload.morale,
        } as unknown as IComponent);
      },
    );
  }

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const units = state.getEntitiesByComponent(MILITARY_UNIT_TYPE);
    const provinceGraph = this.buildSupplyGraph(state);

    for (const unit of units) {
      const mil = unit.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
      if (!mil) continue;

      const supplyInfo = this.computeSupplyStatus(state, mil, provinceGraph);

      const existing = unit.getComponent<SupplyStatusComponent>(SUPPLY_STATUS_TYPE);
      const wasLevel = existing?.level ?? 'full';

      if (supplyInfo.level !== wasLevel) {
        if (supplyInfo.level === 'cut') {
          eventBus.publish<IWarSupplyCutPayload>(
            WAR_SUPPLY_CUT_EVENT,
            { unitId: unit.id, ownerCountryId: mil.ownerCountryId, provinceId: mil.currentProvinceId, reason: 'no-supply-path' },
            SUPPLY_SYSTEM_ID, unit.id,
          );
        } else if (supplyInfo.level === 'full' && wasLevel === 'cut') {
          eventBus.publish<IWarSupplyRestoredPayload>(
            WAR_SUPPLY_RESTORED_EVENT,
            { unitId: unit.id, ownerCountryId: mil.ownerCountryId, sourceProvinceId: supplyInfo.sourceProvinceId ?? '', efficiency: supplyInfo.efficiency },
            SUPPLY_SYSTEM_ID, unit.id,
          );
        }
      }

      if (supplyInfo.level === 'full') {
        const newFuel = Math.min(100, mil.fuelReserves + SUPPLY_FILL_RATE);
        if (newFuel !== mil.fuelReserves) {
          eventBus.publish(
            'war.fuel-consumed',
            { unitId: unit.id, previousFuel: mil.fuelReserves, newFuel },
            SUPPLY_SYSTEM_ID, unit.id,
          );
        }
      } else if (supplyInfo.level === 'cut') {
        const newReadiness = Math.max(0, mil.readiness - SUPPLY_DEGRADE_PENALTY);
        const newMorale = Math.max(0, mil.morale - SUPPLY_DEGRADE_PENALTY);
        eventBus.publish(
          'war.supply-degraded',
          { unitId: unit.id, readiness: newReadiness, morale: newMorale },
          SUPPLY_SYSTEM_ID, unit.id,
        );
      }
    }
  }

  private computeSupplyStatus(
    _state: Readonly<IWorldState>,
    mil: MilitaryUnitComponent,
    graph: Map<string, { neighborIds: ReadonlyArray<string>; ownerId: EntityId; isSupplySource: boolean; terrain: string }>,
  ): { level: SupplyLevel; efficiency: number; sourceProvinceId: string | undefined; distanceToSupply: number } {
    const unitProvince = graph.get(mil.currentProvinceId);
    if (!unitProvince) return { level: 'cut', efficiency: 0, sourceProvinceId: undefined, distanceToSupply: MAX_SUPPLY_DISTANCE };

    const path = this.bfsToSupplySource(mil.currentProvinceId, mil.ownerCountryId, graph);
    if (!path) return { level: 'cut', efficiency: 0, sourceProvinceId: undefined, distanceToSupply: MAX_SUPPLY_DISTANCE };

    const distance = path.length - 1;
    let efficiency = 1.0;

    for (const provId of path) {
      const prov = graph.get(provId);
      if (prov && prov.terrain !== 'plains') {
        const mods = getTerrainModifiers(prov.terrain as TerrainType);
        efficiency *= (1 - mods.supplyEfficiencyPenalty);
      }
    }

    efficiency = Math.max(0, efficiency);
    let level: SupplyLevel;
    if (distance <= 1 && efficiency > 0.7) {
      level = 'full';
    } else if (distance >= DEGRADED_THRESHOLD || efficiency < 0.5) {
      level = 'cut';
    } else {
      level = 'degraded';
    }

    return { level, efficiency, sourceProvinceId: path[0], distanceToSupply: distance };
  }

  private bfsToSupplySource(
    start: string,
    ownerCountryId: EntityId,
    graph: Map<string, { neighborIds: ReadonlyArray<string>; ownerId: EntityId; isSupplySource: boolean; terrain: string }>,
  ): string[] | undefined {
    const visited = new Set<string>([start]);
    const queue: Array<{ id: string; path: string[] }> = [{ id: start, path: [start] }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const prov = graph.get(current.id);

      if (prov && prov.isSupplySource && prov.ownerId === ownerCountryId) {
        return current.path;
      }

      if (current.path.length > MAX_SUPPLY_DISTANCE) continue;

      if (prov && prov.ownerId !== ownerCountryId && current.id !== start) continue;

      for (const neighbor of prov?.neighborIds ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ id: neighbor, path: [...current.path, neighbor] });
        }
      }
    }

    return undefined;
  }

  private buildSupplyGraph(
    state: Readonly<IWorldState>,
  ): Map<string, { neighborIds: ReadonlyArray<string>; ownerId: EntityId; isSupplySource: boolean; terrain: string }> {
    const graph = new Map<string, { neighborIds: ReadonlyArray<string>; ownerId: EntityId; isSupplySource: boolean; terrain: string }>();

    for (const eid of state.getEntityIds()) {
      const entity = state.getEntity(eid);
      if (!entity) continue;
      const provComp = entity.getComponent<ProvinceComponent>(PROVINCE_TYPE);
      if (!provComp) continue;
      for (const prov of provComp.provinces as ReadonlyArray<ProvinceData>) {
        graph.set(prov.provinceId, {
          neighborIds: prov.neighborIds,
          ownerId: prov.ownerId,
          isSupplySource: prov.isSupplySource,
          terrain: prov.terrain,
        });
      }
    }

    return graph;
  }
}
