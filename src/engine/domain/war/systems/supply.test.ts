import { describe, it, expect } from 'vitest';
import { WorldState } from '../../../core/world-state/world-state.js';
import { EventBus } from '../../../core/event-bus/event-bus.js';
import { Timeline } from '../../../core/timeline/timeline.js';
import { TickEngine } from '../../../core/tick-engine/tick-engine.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import {
  MILITARY_UNIT_TYPE,
  MilitaryUnitComponent,
} from '../components/war.components.js';
import {
  PROVINCE_TYPE,
  ProvinceData,
} from '../components/province.components.js';
import { getTerrainModifiers } from '../components/terrain.components.js';
import { SupplySystem } from './supply.system.js';
import {
  WAR_SUPPLY_CUT_EVENT,
} from '../events/war-terrain.events.js';

function makeProvince(
  id: string,
  ownerId: EntityId,
  neighbors: string[],
  terrain: ProvinceData['terrain'] = 'plains',
  isSupplySource = false,
): ProvinceData {
  return {
    provinceId: id,
    provinceName: `Province ${id}`,
    lat: 0, lng: 0,
    neighborIds: neighbors,
    resourceRich: false,
    ownerId,
    terrain,
    isSupplySource,
    occupationProgress: 0,
    occupyingCountryId: undefined,
  };
}

describe('SupplySystem', () => {
  it('should refuel units that are within supply range of a friendly supply source', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('supply-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    const countryId = 'country-a' as EntityId;
    worldState.createEntity(countryId, [{
      type: PROVINCE_TYPE,
      provinces: [
        makeProvince('prov-a1', countryId, ['prov-a2'], 'plains', true),
        makeProvince('prov-a2', countryId, ['prov-a1'], 'plains'),
      ],
    } as unknown as IComponent]);

    const unitId = 'unit-supply-1' as EntityId;
    worldState.createEntity(unitId, [{
      type: MILITARY_UNIT_TYPE,
      ownerCountryId: countryId,
      unitName: 'Test Unit',
      personnel: 5000,
      readiness: 0.8,
      morale: 0.8,
      fuelReserves: 10,
      currentProvinceId: 'prov-a2',
    } as unknown as IComponent]);

    engine.registerSystem(new SupplySystem());
    engine.tick();

    const unit = worldState.getEntity(unitId);
    const mil = unit?.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
    expect(mil).toBeDefined();
    expect(mil!.fuelReserves).toBeGreaterThan(10);
  });

  it('should cut supply when no friendly supply source is reachable', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('supply-cut-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    const countryId = 'country-a' as EntityId;
    const enemyId = 'country-b' as EntityId;
    worldState.createEntity(countryId, [{
      type: PROVINCE_TYPE,
      provinces: [
        makeProvince('prov-a1', countryId, ['prov-b1'], 'plains', true),
      ],
    } as unknown as IComponent]);
    worldState.createEntity(enemyId, [{
      type: PROVINCE_TYPE,
      provinces: [
        makeProvince('prov-b1', enemyId, ['prov-a1', 'prov-b2']),
        makeProvince('prov-b2', enemyId, ['prov-b1']),
      ],
    } as unknown as IComponent]);

    const unitId = 'unit-cut-1' as EntityId;
    worldState.createEntity(unitId, [{
      type: MILITARY_UNIT_TYPE,
      ownerCountryId: countryId,
      unitName: 'Isolated Unit',
      personnel: 5000,
      readiness: 0.9,
      morale: 0.9,
      fuelReserves: 5,
      currentProvinceId: 'prov-b2',
    } as unknown as IComponent]);

    engine.registerSystem(new SupplySystem());
    engine.tick();

    const cutEvents = timeline.query({ eventType: WAR_SUPPLY_CUT_EVENT });
    expect(cutEvents.length).toBeGreaterThanOrEqual(1);

    const unit = worldState.getEntity(unitId);
    const mil = unit?.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
    expect(mil!.readiness).toBeLessThan(0.9);
  });

  it('should apply terrain supply efficiency penalties', () => {
    const terrainMods = getTerrainModifiers('mountains');
    expect(terrainMods.supplyEfficiencyPenalty).toBeGreaterThan(0);
    expect(terrainMods.movementCostMultiplier).toBe(2.0);
    expect(terrainMods.defenderBonus).toBe(0.5);

    const desertMods = getTerrainModifiers('desert');
    expect(desertMods.supplyEfficiencyPenalty).toBe(0.4);
    expect(desertMods.movementCostMultiplier).toBe(1.5);
  });
});
