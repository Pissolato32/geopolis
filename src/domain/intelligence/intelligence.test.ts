import { describe, it, expect } from 'vitest';
import { IntelligenceSystem } from './systems/intelligence.system.js';
import { WorldState } from '../../core/world-state/world-state.js';
import { EventBus } from '../../core/event-bus/event-bus.js';
import { Timeline } from '../../core/timeline/timeline.js';
import { TickEngine } from '../../core/tick-engine/tick-engine.js';
import { STEALTH_OPERATION_TYPE, StealthOperationComponent } from './components/intelligence.components.js';
import { INTEL_REPORT_GENERATED_EVENT, INTEL_OP_COMPROMISED_EVENT } from './events/intelligence.events.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';

describe('Intelligence Domain', () => {
  it('should progress stealth operations and generate intel reports over 5 ticks', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('intel-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    engine.registerSystem(new IntelligenceSystem());

    worldState.createEntity('op-starlight' as EntityId, [
      {
        type: STEALTH_OPERATION_TYPE,
        targetCountryId: 'country-ru' as EntityId,
        operationType: 'cyber-attack',
        progress: 0.2,
        exposureRisk: 0.8, // Triggers compromised event
      } as StealthOperationComponent,
    ]);

    const results = engine.runTicks(5);
    expect(results).toHaveLength(5);

    const reportEvents = timeline.query({ eventType: INTEL_REPORT_GENERATED_EVENT });
    expect(reportEvents).toHaveLength(5);

    const compromisedEvents = timeline.query({ eventType: INTEL_OP_COMPROMISED_EVENT });
    expect(compromisedEvents).toHaveLength(5);
  });
});
