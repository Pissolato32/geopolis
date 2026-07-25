import { describe, it, expect } from 'vitest';
import { DiplomacySystem } from './systems/diplomacy.system.js';
import { WorldState } from '../../core/world-state/world-state.js';
import { EventBus } from '../../core/event-bus/event-bus.js';
import { Timeline } from '../../core/timeline/timeline.js';
import { TickEngine } from '../../core/tick-engine/tick-engine.js';
import { DIPLOMATIC_RELATION_TYPE, RelationComponent } from './components/relation.component.js';
import { DIPLOMACY_TENSION_CHANGED_EVENT } from './events/diplomacy.events.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';

describe('Diplomacy Domain', () => {
  it('should resolve relation component tension drift over 5 ticks', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('diplomacy-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    engine.registerSystem(new DiplomacySystem());

    worldState.createEntity('country-us' as EntityId, [
      {
        type: DIPLOMATIC_RELATION_TYPE,
        targetCountryId: 'country-ch' as EntityId,
        affinity: -0.6, // Hostile
        tension: 0.5,
        recognition: 'full',
        activeTreaties: [],
      } as RelationComponent,
    ]);

    const results = engine.runTicks(5);
    expect(results).toHaveLength(5);

    const tensionEvents = timeline.query({ eventType: DIPLOMACY_TENSION_CHANGED_EVENT });
    expect(tensionEvents).toHaveLength(5);
  });
});
