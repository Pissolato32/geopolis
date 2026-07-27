import { describe, it, expect } from 'vitest';
import { EconomySystem } from './systems/economy.system.js';
import { WorldState } from '../../core/world-state/world-state.js';
import { EventBus } from '../../core/event-bus/event-bus.js';
import { Timeline } from '../../core/timeline/timeline.js';
import { TickEngine } from '../../core/tick-engine/tick-engine.js';
import {
  ECONOMIC_INDICATOR_TYPE,
  RESOURCE_PRODUCTION_TYPE,
  EconomicIndicatorComponent,
  ResourceProductionComponent,
} from './components/economy.components.js';
import { ECONOMY_GDP_UPDATED_EVENT, ECONOMY_RESOURCE_SHORTAGE_EVENT } from './events/economy.events.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';
import { ITypedEvent } from '../../core/interfaces/event-bus.interface.js';

describe('Economy Domain', () => {
  it('should apply weekly (not annual) GDP growth rate per tick', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('economy-growth-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    worldState.createEntity('country-gr' as EntityId, [
      {
        type: ECONOMIC_INDICATOR_TYPE,
        gdp: 1_000_000,
        inflationRate: 0.02,
        treasury: 50_000,
        taxRate: 0.2,
      } as EconomicIndicatorComponent,
      {
        type: RESOURCE_PRODUCTION_TYPE,
        energyOutput: 100,
        foodOutput: 100,
        mineralsOutput: 50,
        industrialOutput: 300,
      } as ResourceProductionComponent,
    ]);

    engine.registerSystem(new EconomySystem());
    engine.runTicks(52);

    const gdpEvents = timeline.query({ eventType: ECONOMY_GDP_UPDATED_EVENT });
    expect(gdpEvents).toHaveLength(52);

    // After 52 weekly ticks, GDP should have grown by roughly the annual rate (~2-5%),
    // NOT by 52× the annual rate (which would be the hyper-growth bug).
    const finalGdpEvent = gdpEvents[51]!;
    const finalGdp = (finalGdpEvent.event as ITypedEvent<{ newGdp: number }>).payload.newGdp;

    // With the fix: 52 weeks at ~0.03-0.08% per week → ~2-4% annual growth
    // The old bug would have produced ~100-260% growth (2-5% per tick × 52 ticks)
    expect(finalGdp).toBeGreaterThan(1_000_000);
    expect(finalGdp).toBeLessThan(1_100_000); // must stay under 10% growth for one year
  });

  it('should process economic simulation over 5 ticks and emit GDP events', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('economy-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    worldState.createEntity('country-br' as EntityId, [
      {
        type: ECONOMIC_INDICATOR_TYPE,
        gdp: 2000,
        inflationRate: 0.04,
        treasury: 150,
        taxRate: 0.2,
      } as EconomicIndicatorComponent,
      {
        type: RESOURCE_PRODUCTION_TYPE,
        energyOutput: 10, // Trigger energy shortage (< 20)
        foodOutput: 100,
        mineralsOutput: 50,
        industrialOutput: 300,
      } as ResourceProductionComponent,
    ]);

    engine.registerSystem(new EconomySystem());
    const results = engine.runTicks(5);

    expect(results).toHaveLength(5);
    expect(timeline.getEventCount()).toBe(10); // 5 GDP + 5 shortage events

    const gdpEvents = timeline.query({ eventType: ECONOMY_GDP_UPDATED_EVENT });
    expect(gdpEvents).toHaveLength(5);

    const shortageEvents = timeline.query({ eventType: ECONOMY_RESOURCE_SHORTAGE_EVENT });
    expect(shortageEvents).toHaveLength(5);
  });
});
