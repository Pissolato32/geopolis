import { describe, it, expect } from 'vitest';
import { PeaceSystem } from './peace.system.js';
import { WorldState } from '../../../core/world-state/world-state.js';
import { EventBus } from '../../../core/event-bus/event-bus.js';
import { Timeline } from '../../../core/timeline/timeline.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import {
  WAR_PEACE_REQUESTED_EVENT,
  WAR_PEACE_SIGNED_EVENT,
  IWarPeaceRequestedPayload,
  IWarPeaceSignedPayload,
} from '../events/war.events.js';
import { DIPLOMATIC_RELATION_TYPE, RelationComponent } from '../../diplomacy/components/relation.component.js';

interface GeoProvinceComp extends IComponent {
  provinces: any[];
}

describe('PeaceSystem (War Domain Unit Tests)', () => {
  function setupTest(affinity = 0.0, tension = 0.4) {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('peace-test');
    const system = new PeaceSystem();
    system.initialize(eventBus, worldState);

    // Country A & Country B
    worldState.createEntity('country-a' as EntityId, [
      {
        type: 'geo.province',
        provinces: [
          { provinceId: 'prov-a1', provinceName: 'Alpha', lat: 0, lng: 0, neighborIds: [], resourceRich: false, ownerId: 'country-a' },
          { provinceId: 'prov-b1', provinceName: 'Beta', lat: 5, lng: 5, neighborIds: [], resourceRich: true, ownerId: 'country-a' },
        ],
      },
      {
        type: DIPLOMATIC_RELATION_TYPE,
        targetCountryId: 'country-b' as EntityId,
        affinity,
        tension,
        recognition: 'full',
        activeTreaties: [],
      } as RelationComponent,
    ]);

    worldState.createEntity('country-b' as EntityId, [
      {
        type: 'geo.province',
        provinces: [],
      },
      {
        type: DIPLOMATIC_RELATION_TYPE,
        targetCountryId: 'country-a' as EntityId,
        affinity,
        tension,
        recognition: 'full',
        activeTreaties: [],
      } as RelationComponent,
    ]);

    return { timeline, eventBus, worldState, system };
  }

  it('should process peace request, return provinces and sign peace when accepted', () => {
    const { timeline, eventBus, worldState } = setupTest(0.8, 0.2); // High affinity -> high acceptance chance

    eventBus.publish<IWarPeaceRequestedPayload>(
      WAR_PEACE_REQUESTED_EVENT,
      {
        initiator: 'country-b',
        target: 'country-a',
        returnProvinces: ['prov-b1'],
      },
      'user',
      'country-b' as EntityId,
    );
    eventBus.flush();

    const signedEvents = timeline.query({ eventType: WAR_PEACE_SIGNED_EVENT });
    expect(signedEvents).toHaveLength(1);
    const signedPayload = (signedEvents[0]!.event as unknown as { payload: IWarPeaceSignedPayload }).payload;

    expect(signedPayload.initiator).toBe('country-b');
    expect(signedPayload.target).toBe('country-a');
    expect(signedPayload.returnedProvinces).toContain('prov-b1');
    expect(signedPayload.newTension).toBe(0.2);

    // Verify province transferred to country-b
    const countryB = worldState.getEntity('country-b' as EntityId);
    const provsB = countryB?.getComponent<GeoProvinceComp>('geo.province')?.provinces;
    expect(provsB).toHaveLength(1);
    expect(provsB?.[0]?.provinceId).toBe('prov-b1');
  });

  it('should reject peace request if relation is missing', () => {
    const { timeline, eventBus } = setupTest();

    eventBus.publish<IWarPeaceRequestedPayload>(
      WAR_PEACE_REQUESTED_EVENT,
      {
        initiator: 'country-b',
        target: 'country-unknown',
      },
      'user',
      'country-b' as EntityId,
    );
    eventBus.flush();

    expect(timeline.query({ eventType: WAR_PEACE_SIGNED_EVENT })).toHaveLength(0);
  });
});
