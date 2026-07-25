import { describe, it, expect } from 'vitest';
import { ProvinceCombatSystem, PROVINCE_COMBAT_SYSTEM_ID } from './province-combat.system.js';
import { WorldState } from '../../../core/world-state/world-state.js';
import { EventBus } from '../../../core/event-bus/event-bus.js';
import { Timeline } from '../../../core/timeline/timeline.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import { MILITARY_UNIT_TYPE, MilitaryUnitComponent } from '../components/war.components.js';
import { WAR_COMBAT_RESOLVED_EVENT, IWarCombatResolvedPayload } from '../events/war.events.js';
import { DIPLOMATIC_RELATION_TYPE, RelationComponent } from '../../diplomacy/components/relation.component.js';

describe('ProvinceCombatSystem (War Domain Unit Tests)', () => {
  function setupTest() {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('province-combat-test');
    const system = new ProvinceCombatSystem();
    system.initialize(eventBus, worldState);

    // Hostile relation between Country A and Country B (affinity < -0.3, tension >= 0.6)
    worldState.createEntity('country-a' as EntityId, [
      {
        type: DIPLOMATIC_RELATION_TYPE,
        targetCountryId: 'country-b' as EntityId,
        affinity: -0.6,
        tension: 0.8,
        recognition: 'full',
        activeTreaties: [],
      } as RelationComponent,
    ]);

    worldState.createEntity('country-b' as EntityId, [
      {
        type: DIPLOMATIC_RELATION_TYPE,
        targetCountryId: 'country-a' as EntityId,
        affinity: -0.6,
        tension: 0.8,
        recognition: 'full',
        activeTreaties: [],
      } as RelationComponent,
    ]);

    return { timeline, eventBus, worldState, system };
  }

  it('should trigger combat when hostile opposing units share the same province', () => {
    const { timeline, eventBus, worldState, system } = setupTest();

    worldState.createEntity('unit-a1' as EntityId, [
      {
        type: MILITARY_UNIT_TYPE,
        ownerCountryId: 'country-a' as EntityId,
        unitName: '1st Division A',
        personnel: 10000,
        readiness: 0.9,
        morale: 0.9,
        fuelReserves: 5,
        currentProvinceId: 'contested-prov-1',
      } as MilitaryUnitComponent,
    ]);

    worldState.createEntity('unit-b1' as EntityId, [
      {
        type: MILITARY_UNIT_TYPE,
        ownerCountryId: 'country-b' as EntityId,
        unitName: '1st Division B',
        personnel: 8000,
        readiness: 0.8,
        morale: 0.8,
        fuelReserves: 5,
        currentProvinceId: 'contested-prov-1',
      } as MilitaryUnitComponent,
    ]);

    system.execute(worldState, eventBus);
    eventBus.flush();

    const combatEvents = timeline.query({ eventType: WAR_COMBAT_RESOLVED_EVENT });
    expect(combatEvents).toHaveLength(1);

    const payload = (combatEvents[0]!.event as unknown as { payload: IWarCombatResolvedPayload }).payload;
    expect(payload.provinceId).toBe('contested-prov-1');
    expect(payload.attackerCasualties).toBeGreaterThan(0);
    expect(payload.defenderCasualties).toBeGreaterThan(0);
  });

  it('should apply casualties to military units when combat event is processed', () => {
    const { eventBus, worldState } = setupTest();

    worldState.createEntity('unit-a1' as EntityId, [
      {
        type: MILITARY_UNIT_TYPE,
        ownerCountryId: 'country-a' as EntityId,
        unitName: '1st Division A',
        personnel: 10000,
        readiness: 1.0,
        morale: 1.0,
        fuelReserves: 5,
        currentProvinceId: 'prov-1',
      } as MilitaryUnitComponent,
    ]);

    worldState.createEntity('unit-b1' as EntityId, [
      {
        type: MILITARY_UNIT_TYPE,
        ownerCountryId: 'country-b' as EntityId,
        unitName: '1st Division B',
        personnel: 5000,
        readiness: 1.0,
        morale: 1.0,
        fuelReserves: 5,
        currentProvinceId: 'prov-1',
      } as MilitaryUnitComponent,
    ]);

    eventBus.publish<IWarCombatResolvedPayload>(
      WAR_COMBAT_RESOLVED_EVENT,
      {
        attackerId: 'country-a',
        defenderId: 'country-b',
        attackerCasualties: 1000,
        defenderCasualties: 2000,
        victorId: 'country-a',
        provinceId: 'prov-1',
        eliminatedId: undefined,
      },
      PROVINCE_COMBAT_SYSTEM_ID,
      'country-a' as EntityId,
    );
    eventBus.flush();

    const unitA = worldState.getEntity('unit-a1' as EntityId);
    const milA = unitA?.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
    expect(milA?.personnel).toBe(9000); // 10000 - 1000

    const unitB = worldState.getEntity('unit-b1' as EntityId);
    const milB = unitB?.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
    expect(milB?.personnel).toBe(3000); // 5000 - 2000
  });

  it('should not engage in combat if affinity is peaceful (>= -0.3) or tension low (< 0.6)', () => {
    const { timeline, eventBus, worldState, system } = setupTest();

    // Friendly relation (affinity 0.5, tension 0.1)
    worldState.createEntity('country-c' as EntityId, [
      {
        type: DIPLOMATIC_RELATION_TYPE,
        targetCountryId: 'country-a' as EntityId,
        affinity: 0.5,
        tension: 0.1,
        recognition: 'full',
        activeTreaties: [],
      } as RelationComponent,
    ]);

    worldState.createEntity('unit-c1' as EntityId, [
      {
        type: MILITARY_UNIT_TYPE,
        ownerCountryId: 'country-c' as EntityId,
        unitName: 'Allied Patrol',
        personnel: 5000,
        readiness: 1.0,
        morale: 1.0,
        fuelReserves: 5,
        currentProvinceId: 'shared-prov',
      } as MilitaryUnitComponent,
    ]);

    worldState.createEntity('unit-a2' as EntityId, [
      {
        type: MILITARY_UNIT_TYPE,
        ownerCountryId: 'country-a' as EntityId,
        unitName: 'Division A2',
        personnel: 5000,
        readiness: 1.0,
        morale: 1.0,
        fuelReserves: 5,
        currentProvinceId: 'shared-prov',
      } as MilitaryUnitComponent,
    ]);

    system.execute(worldState, eventBus);

    expect(timeline.query({ eventType: WAR_COMBAT_RESOLVED_EVENT })).toHaveLength(0);
  });
});
