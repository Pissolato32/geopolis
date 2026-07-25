import { describe, it, expect } from 'vitest';
import { TreatySystem } from './treaty.system.js';
import { WorldState } from '../../../core/world-state/world-state.js';
import { EventBus } from '../../../core/event-bus/event-bus.js';
import { Timeline } from '../../../core/timeline/timeline.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import { DIPLOMATIC_RELATION_TYPE, RelationComponent } from '../components/relation.component.js';
import {
  DIPLOMACY_TREATY_SIGNED_EVENT,
  DIPLOMACY_TENSION_CHANGED_EVENT,
  IDiplomacyTreatySignedPayload,
  IDiplomacyTensionChangedPayload,
} from '../events/diplomacy.events.js';

describe('TreatySystem (Diplomacy Domain Unit Tests)', () => {
  function setupTest() {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('treaty-test');
    const system = new TreatySystem();
    system.initialize(eventBus, worldState);

    // Country A & Country B relations
    worldState.createEntity('country-a' as EntityId, [
      {
        type: DIPLOMATIC_RELATION_TYPE,
        targetCountryId: 'country-b' as EntityId,
        affinity: 0.2,
        tension: 0.5,
        recognition: 'full',
        activeTreaties: [],
      } as RelationComponent,
    ]);

    worldState.createEntity('country-b' as EntityId, [
      {
        type: DIPLOMATIC_RELATION_TYPE,
        targetCountryId: 'country-a' as EntityId,
        affinity: 0.2,
        tension: 0.5,
        recognition: 'full',
        activeTreaties: [],
      } as RelationComponent,
    ]);

    return { timeline, eventBus, worldState, system };
  }

  it('should lower tension (-0.15) and increase affinity (+0.10) for defense treaty', () => {
    const { timeline, eventBus, worldState } = setupTest();

    eventBus.publish<IDiplomacyTreatySignedPayload>(
      DIPLOMACY_TREATY_SIGNED_EVENT,
      {
        treatyId: 'treaty-def-1',
        signatories: ['country-a', 'country-b'],
        treatyType: 'defense',
      },
      'diplomacy.action',
      'country-a' as EntityId,
    );
    eventBus.flush();

    const tensionEvents = timeline.query({ eventType: DIPLOMACY_TENSION_CHANGED_EVENT });
    expect(tensionEvents).toHaveLength(2); // Published for A -> B and B -> A

    const payload = (tensionEvents[0]!.event as unknown as { payload: IDiplomacyTensionChangedPayload }).payload;
    expect(payload.previousTension).toBe(0.5);
    expect(payload.newTension).toBe(0.35); // 0.5 - 0.15
    expect(payload.affinity).toBeCloseTo(0.3); // 0.2 + 0.10

    const relA = worldState.getEntity('country-a' as EntityId)?.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
    expect(relA?.tension).toBe(0.35);
    expect(relA?.affinity).toBeCloseTo(0.3);
    expect(relA?.activeTreaties).toContain('treaty-def-1');
  });

  it('should lower tension (-0.20) and increase affinity (+0.05) for non-aggression pact', () => {
    const { eventBus, worldState } = setupTest();

    eventBus.publish<IDiplomacyTreatySignedPayload>(
      DIPLOMACY_TREATY_SIGNED_EVENT,
      {
        treatyId: 'treaty-nap-1',
        signatories: ['country-a', 'country-b'],
        treatyType: 'non-aggression',
      },
      'diplomacy.action',
      'country-a' as EntityId,
    );
    eventBus.flush();

    const relA = worldState.getEntity('country-a' as EntityId)?.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
    expect(relA?.tension).toBe(0.3); // 0.5 - 0.20
    expect(relA?.affinity).toBe(0.25); // 0.2 + 0.05
    expect(relA?.activeTreaties).toContain('treaty-nap-1');
  });

  it('should lower tension (-0.05) and increase affinity (+0.15) for trade treaty', () => {
    const { eventBus, worldState } = setupTest();

    eventBus.publish<IDiplomacyTreatySignedPayload>(
      DIPLOMACY_TREATY_SIGNED_EVENT,
      {
        treatyId: 'treaty-trade-1',
        signatories: ['country-a', 'country-b'],
        treatyType: 'trade',
      },
      'diplomacy.action',
      'country-a' as EntityId,
    );
    eventBus.flush();

    const relA = worldState.getEntity('country-a' as EntityId)?.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
    expect(relA?.tension).toBe(0.45); // 0.5 - 0.05
    expect(relA?.affinity).toBe(0.35); // 0.2 + 0.15
    expect(relA?.activeTreaties).toContain('treaty-trade-1');
  });

  it('should clamp tension to min 0.0 and affinity to max 1.0', () => {
    const { eventBus, worldState } = setupTest();

    // Set initial tension 0.1 and affinity 0.95
    worldState.updateComponent('country-a' as EntityId, {
      type: DIPLOMATIC_RELATION_TYPE,
      targetCountryId: 'country-b' as EntityId,
      affinity: 0.95,
      tension: 0.1,
      recognition: 'full',
      activeTreaties: [],
    } as unknown as RelationComponent);

    eventBus.publish<IDiplomacyTreatySignedPayload>(
      DIPLOMACY_TREATY_SIGNED_EVENT,
      {
        treatyId: 'treaty-def-max',
        signatories: ['country-a', 'country-b'],
        treatyType: 'defense',
      },
      'diplomacy.action',
      'country-a' as EntityId,
    );
    eventBus.flush();

    const relA = worldState.getEntity('country-a' as EntityId)?.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
    expect(relA?.tension).toBe(0.0); // clamped Math.max(0, 0.1 - 0.15)
    expect(relA?.affinity).toBe(1.0); // clamped Math.min(1, 0.95 + 0.10)
  });
});
