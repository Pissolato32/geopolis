import { describe, it, expect } from 'vitest';
import { PoliticsSystem } from './systems/politics.system.js';
import { WorldState } from '../../core/world-state/world-state.js';
import { EventBus } from '../../core/event-bus/event-bus.js';
import { Timeline } from '../../core/timeline/timeline.js';
import { TickEngine } from '../../core/tick-engine/tick-engine.js';
import { GOVERNMENT_STABILITY_TYPE, GovernmentStabilityComponent } from './components/politics.components.js';
import { POLITICS_STABILITY_CHANGED_EVENT } from './events/politics.events.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';

describe('Politics Domain', () => {
  it('should process stability drift over 5 ticks', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('politics-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    const politicsSys = new PoliticsSystem();
    politicsSys.initialize(eventBus);
    engine.registerSystem(politicsSys);

    worldState.createEntity('country-ar' as EntityId, [
      {
        type: GOVERNMENT_STABILITY_TYPE,
        stabilityIndex: 0.8,
        approvalRating: 0.7,
        militaryLoyalty: 0.9,
      } as GovernmentStabilityComponent,
    ]);

    const results = engine.runTicks(5);
    expect(results).toHaveLength(5);

    const stabilityEvents = timeline.query({ eventType: POLITICS_STABILITY_CHANGED_EVENT });
    expect(stabilityEvents).toHaveLength(5);
  });
});
