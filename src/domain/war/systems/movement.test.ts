import { describe, it, expect } from 'vitest';
import { MovementSystem, MOVEMENT_SYSTEM_ID } from './movement.system.js';
import { WorldState } from '../../../core/world-state/world-state.js';
import { EventBus } from '../../../core/event-bus/event-bus.js';
import { Timeline } from '../../../core/timeline/timeline.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import { MILITARY_UNIT_TYPE, MilitaryUnitComponent } from '../components/war.components.js';
import {
  WAR_MOVE_ORDERED_EVENT,
  WAR_UNIT_MOVED_EVENT,
  WAR_FUEL_CONSUMED_EVENT,
  IWarUnitMovedPayload,
  IWarFuelConsumedPayload,
} from '../events/war.events.js';

describe('MovementSystem (War Domain Unit Tests)', () => {
  function setupTest() {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('movement-test');
    const system = new MovementSystem();
    system.initialize(eventBus, worldState);

    // Setup map graph with 3 provinces: P1 <-> P2 <-> P3
    worldState.createEntity('map-graph' as EntityId, [
      {
        type: 'geo.province',
        provinces: [
          { provinceId: 'prov-1', neighborIds: ['prov-2'] },
          { provinceId: 'prov-2', neighborIds: ['prov-1', 'prov-3'] },
          { provinceId: 'prov-3', neighborIds: ['prov-2'] },
        ],
      },
    ]);

    return { timeline, eventBus, worldState, system };
  }

  it('should set move target province when move is ordered', () => {
    const { eventBus, worldState } = setupTest();

    worldState.createEntity('unit-1' as EntityId, [
      {
        type: MILITARY_UNIT_TYPE,
        ownerCountryId: 'country-a' as EntityId,
        unitName: '1st Division',
        personnel: 10000,
        readiness: 1.0,
        morale: 1.0,
        fuelReserves: 10,
        currentProvinceId: 'prov-1',
      } as MilitaryUnitComponent,
    ]);

    eventBus.publish(
      WAR_MOVE_ORDERED_EVENT,
      { unitId: 'unit-1', targetProvinceId: 'prov-3' },
      'user',
      'unit-1' as EntityId,
    );
    eventBus.flush();

    const unit = worldState.getEntity('unit-1' as EntityId);
    const mil = unit?.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
    expect(mil?.moveTargetProvinceId).toBe('prov-3');
    expect(mil?.moveProgress).toBe(0);
  });

  it('should execute BFS movement step towards distant target and consume fuel', () => {
    const { timeline, eventBus, worldState, system } = setupTest();

    worldState.createEntity('unit-1' as EntityId, [
      {
        type: MILITARY_UNIT_TYPE,
        ownerCountryId: 'country-a' as EntityId,
        unitName: '1st Division',
        personnel: 10000,
        readiness: 1.0,
        morale: 1.0,
        fuelReserves: 5,
        currentProvinceId: 'prov-1',
        moveTargetProvinceId: 'prov-3',
      } as MilitaryUnitComponent,
    ]);

    system.execute(worldState, eventBus);
    eventBus.flush();

    const fuelEvents = timeline.query({ eventType: WAR_FUEL_CONSUMED_EVENT });
    expect(fuelEvents).toHaveLength(1);
    const fuelPayload = (fuelEvents[0]!.event as unknown as { payload: IWarFuelConsumedPayload }).payload;
    expect(fuelPayload.previousFuel).toBe(5);
    expect(fuelPayload.newFuel).toBe(4);

    const moveEvents = timeline.query({ eventType: WAR_UNIT_MOVED_EVENT });
    expect(moveEvents).toHaveLength(1);
    const movePayload = (moveEvents[0]!.event as unknown as { payload: IWarUnitMovedPayload }).payload;
    expect(movePayload.fromProvinceId).toBe('prov-1');
    expect(movePayload.toProvinceId).toBe('prov-2');
  });

  it('should not move unit if fuel reserves are 0', () => {
    const { timeline, eventBus, worldState, system } = setupTest();

    worldState.createEntity('unit-no-fuel' as EntityId, [
      {
        type: MILITARY_UNIT_TYPE,
        ownerCountryId: 'country-a' as EntityId,
        unitName: 'Stranded Brigade',
        personnel: 5000,
        readiness: 1.0,
        morale: 1.0,
        fuelReserves: 0,
        currentProvinceId: 'prov-1',
        moveTargetProvinceId: 'prov-2',
      } as MilitaryUnitComponent,
    ]);

    system.execute(worldState, eventBus);

    expect(timeline.query({ eventType: WAR_UNIT_MOVED_EVENT })).toHaveLength(0);
    expect(timeline.query({ eventType: WAR_FUEL_CONSUMED_EVENT })).toHaveLength(0);
  });

  it('should update current province and progress when WAR_UNIT_MOVED_EVENT is processed', () => {
    const { eventBus, worldState } = setupTest();

    worldState.createEntity('unit-1' as EntityId, [
      {
        type: MILITARY_UNIT_TYPE,
        ownerCountryId: 'country-a' as EntityId,
        unitName: '1st Division',
        personnel: 10000,
        readiness: 1.0,
        morale: 1.0,
        fuelReserves: 10,
        currentProvinceId: 'prov-1',
        moveTargetProvinceId: 'prov-2',
        moveProgress: 0,
      } as MilitaryUnitComponent,
    ]);

    eventBus.publish<IWarUnitMovedPayload>(
      WAR_UNIT_MOVED_EVENT,
      { unitId: 'unit-1', ownerCountryId: 'country-a', fromProvinceId: 'prov-1', toProvinceId: 'prov-2' },
      MOVEMENT_SYSTEM_ID,
      'unit-1' as EntityId,
    );
    eventBus.flush();

    const unit = worldState.getEntity('unit-1' as EntityId);
    const mil = unit?.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
    expect(mil?.currentProvinceId).toBe('prov-2');
    expect(mil?.moveProgress).toBe(100);
    expect(mil?.moveTargetProvinceId).toBeUndefined();
  });
});
