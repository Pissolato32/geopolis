import { describe, it, expect } from 'vitest';
import { OccupationSystem } from './occupation.system.js';
import { PROVINCE_COMBAT_SYSTEM_ID } from './province-combat.system.js';
import { WorldState } from '../../../core/world-state/world-state.js';
import { EventBus } from '../../../core/event-bus/event-bus.js';
import { Timeline } from '../../../core/timeline/timeline.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import {
  WAR_COMBAT_RESOLVED_EVENT,
  WAR_PROVINCE_CAPTURED_EVENT,
  IWarCombatResolvedPayload,
  IWarProvinceCapturedPayload,
} from '../events/war.events.js';
import { DIPLOMATIC_RELATION_TYPE, RelationComponent } from '../../diplomacy/components/relation.component.js';

interface GeoProvinceComponent extends IComponent {
  provinces: any[];
}

describe('OccupationSystem (War Domain Unit Tests)', () => {
  function setupTest() {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('occupation-test');
    const system = new OccupationSystem();
    system.initialize(eventBus, worldState);

    // Defeated entity (Country B) with 1 province
    worldState.createEntity('country-b' as EntityId, [
      {
        type: 'geo.province',
        provinces: [
          { provinceId: 'prov-b1', provinceName: 'Borderlands', lat: 10, lng: 20, neighborIds: [], resourceRich: true, ownerId: 'country-b' },
        ],
      },
      {
        type: DIPLOMATIC_RELATION_TYPE,
        targetCountryId: 'country-a' as EntityId,
        affinity: -0.5,
        tension: 0.8,
        recognition: 'full',
        activeTreaties: [],
      } as RelationComponent,
    ]);

    // Victor entity (Country A)
    worldState.createEntity('country-a' as EntityId, [
      {
        type: 'geo.province',
        provinces: [
          { provinceId: 'prov-a1', provinceName: 'Capital', lat: 0, lng: 0, neighborIds: [], resourceRich: false, ownerId: 'country-a' },
        ],
      },
      {
        type: DIPLOMATIC_RELATION_TYPE,
        targetCountryId: 'country-b' as EntityId,
        affinity: -0.5,
        tension: 0.8,
        recognition: 'full',
        activeTreaties: [],
      } as RelationComponent,
    ]);

    return { timeline, eventBus, worldState, system };
  }

  it('should transfer province from defeated country to victor upon combat elimination', () => {
    const { timeline, eventBus, worldState } = setupTest();

    eventBus.publish<IWarCombatResolvedPayload>(
      WAR_COMBAT_RESOLVED_EVENT,
      {
        attackerId: 'country-a',
        defenderId: 'country-b',
        attackerCasualties: 100,
        defenderCasualties: 5000,
        victorId: 'country-a',
        provinceId: 'prov-b1',
        eliminatedId: 'country-b',
      },
      PROVINCE_COMBAT_SYSTEM_ID,
      'country-a' as EntityId,
    );
    eventBus.flush();

    const capturedEvents = timeline.query({ eventType: WAR_PROVINCE_CAPTURED_EVENT });
    expect(capturedEvents).toHaveLength(1);
    const capturedPayload = (capturedEvents[0]!.event as unknown as { payload: IWarProvinceCapturedPayload }).payload;

    expect(capturedPayload.provinceId).toBe('prov-b1');
    expect(capturedPayload.oldOwnerId).toBe('country-b');
    expect(capturedPayload.newOwnerId).toBe('country-a');

    // Check world state entity provinces
    const countryB = worldState.getEntity('country-b' as EntityId);
    const provsB = countryB?.getComponent<GeoProvinceComponent>('geo.province')?.provinces;
    expect(provsB).toHaveLength(0);

    const countryA = worldState.getEntity('country-a' as EntityId);
    const provsA = countryA?.getComponent<GeoProvinceComponent>('geo.province')?.provinces;
    expect(provsA).toHaveLength(2);
    expect(provsA?.find((p) => p.provinceId === 'prov-b1')?.ownerId).toBe('country-a');
  });

  it('should ignore combat resolved events not emitted by PROVINCE_COMBAT_SYSTEM_ID', () => {
    const { timeline, eventBus } = setupTest();

    eventBus.publish<IWarCombatResolvedPayload>(
      WAR_COMBAT_RESOLVED_EVENT,
      {
        attackerId: 'country-a',
        defenderId: 'country-b',
        attackerCasualties: 100,
        defenderCasualties: 5000,
        victorId: 'country-a',
        provinceId: 'prov-b1',
        eliminatedId: 'country-b',
      },
      'some.other.system',
      'country-a' as EntityId,
    );
    eventBus.flush();

    expect(timeline.query({ eventType: WAR_PROVINCE_CAPTURED_EVENT })).toHaveLength(0);
  });

  it('should adjust diplomatic relations (decrease affinity, increase tension) upon occupation', () => {
    const { eventBus, worldState } = setupTest();

    eventBus.publish<IWarCombatResolvedPayload>(
      WAR_COMBAT_RESOLVED_EVENT,
      {
        attackerId: 'country-a',
        defenderId: 'country-b',
        attackerCasualties: 100,
        defenderCasualties: 5000,
        victorId: 'country-a',
        provinceId: 'prov-b1',
        eliminatedId: 'country-b',
      },
      PROVINCE_COMBAT_SYSTEM_ID,
      'country-a' as EntityId,
    );
    eventBus.flush();

    const relA = worldState.getEntity('country-a' as EntityId)?.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
    expect(relA?.affinity).toBe(-0.7); // -0.5 - 0.2
    expect(relA?.tension).toBe(0.95); // 0.8 + 0.15
  });
});
