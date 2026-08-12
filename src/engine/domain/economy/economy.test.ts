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
  it('should compound an effective annual GDP rate exactly over 52 weekly ticks', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('economy-growth-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    // Controlled fixture: 100,000 industrial output reaches the 2% annual
    // production-growth cap, with zero inflation or infamy penalties.
    const initialGdp = 1_000_000;
    const expectedAnnualGrowthRate = 0.02;
    const expectedWeeklyGrowthRate = Math.pow(1 + expectedAnnualGrowthRate, 1 / 52) - 1;

    worldState.createEntity('country-gr' as EntityId, [
      {
        type: ECONOMIC_INDICATOR_TYPE,
        gdp: initialGdp,
        inflationRate: 0,
        treasury: 50_000,
        taxRate: 0.2,
      } as EconomicIndicatorComponent,
      {
        type: RESOURCE_PRODUCTION_TYPE,
        energyOutput: 0,
        foodOutput: 0,
        mineralsOutput: 0,
        industrialOutput: 100_000,
      } as ResourceProductionComponent,
    ]);

    engine.registerSystem(new EconomySystem());
    engine.runTicks(52);

    const gdpEvents = timeline.query({ eventType: ECONOMY_GDP_UPDATED_EVENT });
    expect(gdpEvents).toHaveLength(52);

    const firstGdpEvent = gdpEvents[0]!;
    const firstGrowthRate = (firstGdpEvent.event as ITypedEvent<{ gdpGrowthRate: number }>).payload.gdpGrowthRate;
    expect(firstGrowthRate).toBeCloseTo(expectedWeeklyGrowthRate, 15);

    const finalGdpEvent = gdpEvents[51]!;
    const finalGdp = (finalGdpEvent.event as ITypedEvent<{ newGdp: number }>).payload.newGdp;

    // 52 equivalent weekly rates must reproduce the effective annual rate.
    expect(finalGdp).toBeCloseTo(initialGdp * (1 + expectedAnnualGrowthRate), 5);

    // Applying the full annual rate on every weekly tick would produce
    // substantially larger hyper-growth and must not match this result.
    expect(finalGdp).toBeLessThan(initialGdp * Math.pow(1 + expectedAnnualGrowthRate, 2));
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
