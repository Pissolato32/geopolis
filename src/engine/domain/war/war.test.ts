import { describe, it, expect } from 'vitest';
import { WarSystem } from './systems/war.system.js';
import { WorldState } from '../../core/world-state/world-state.js';
import { EventBus } from '../../core/event-bus/event-bus.js';
import { Timeline } from '../../core/timeline/timeline.js';
import { TickEngine } from '../../core/tick-engine/tick-engine.js';
import { MILITARY_UNIT_TYPE, MilitaryUnitComponent } from './components/war.components.js';
import { WAR_FUEL_DEPLETED_EVENT } from './events/war.events.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';

describe('War Domain', () => {
  it('should process unit fuel consumption and trigger fuel depleted event', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('war-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    engine.registerSystem(new WarSystem());

    worldState.createEntity('unit-1' as EntityId, [
      {
        type: MILITARY_UNIT_TYPE,
        unitName: '1st Armored Division',
        personnel: 12000,
        readiness: 0.9,
        morale: 0.85,
        fuelReserves: 3, // Exhausts on tick 2
      } as MilitaryUnitComponent,
    ]);

    const results = engine.runTicks(3);
    expect(results).toHaveLength(3);

    const fuelEvents = timeline.query({ eventType: WAR_FUEL_DEPLETED_EVENT });
    expect(fuelEvents.length).toBeGreaterThanOrEqual(1);
  });
});
