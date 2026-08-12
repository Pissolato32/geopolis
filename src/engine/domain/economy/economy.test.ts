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
  it('should deterministically compound GDP at the mathematically exact annual rate over 52 ticks', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('economy-growth-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    // With these values:
    // productionBonus = Math.min(0.02, (totalOutput / 500) * 0.0001) = Math.min(0.02, (1000 / 500) * 0.0001) = 0.0002
    // effectiveInflation = 0.0
    // annualGrowthRate = Math.max(-0.05, Math.min(0.05, 0.0002 - 0 * 0.0005 - 0)) = 0.0002 (0.02%)
    // But to make it a more round number let's adjust totalOutput to give a known positive rate, e.g. 2% growth.
    // However, the productionBonus formula limits it:
    // productionBonus is AT MOST 0.02.
    // If we want exactly 0.02 (2% annual growth), we need (totalOutput / 500) * 0.0001 >= 0.02
    // => totalOutput / 500 >= 200 => totalOutput >= 100000.
    // Let's set energyOutput and industrialOutput to reach totalOutput = 100000.
    // totalOutput = industrialOutput + energyOutput * 0.5
    // Let's set industrialOutput = 100000.

    worldState.createEntity('country-gr' as EntityId, [
      {
        type: ECONOMIC_INDICATOR_TYPE,
        gdp: 1_000_000,
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

    const finalGdpEvent = gdpEvents[51]!;
    const finalGdp = (finalGdpEvent.event as ITypedEvent<{ newGdp: number }>).payload.newGdp;

    // annualGrowthRate should be exactly 0.02.
    // After 52 weeks compounding: finalGdp should be exactly 1_000_000 * 1.02 = 1_020_000.
    expect(finalGdp).toBeCloseTo(1_020_000, 5);

    // And also ensure it does not compound at 52 * 0.02 = 1.04 => 1_040_000 or (1.02)^52 => hyper-growth.
    expect(finalGdp).toBeLessThan(1_040_000);
  });

  it('should preserve a low annual GDP growth rate over 52 weekly ticks', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('economy-weekly-regression');
    const engine = new TickEngine(worldState, eventBus, timeline);

    // Controlled fixture: totalOutput = 300 + (100 * 0.5) = 350 and inflationRate = 0.02.
    // Therefore annualGrowthRate = 0.00007 - (0.02 * 0.0005) = 0.00006.
    const initialGdp = 1_000_000;
    const expectedAnnualGrowthRate = 0.00006;
    const expectedFinalGdp = initialGdp * (1 + expectedAnnualGrowthRate);

    worldState.createEntity('country-weekly' as EntityId, [
      {
        type: ECONOMIC_INDICATOR_TYPE,
        gdp: initialGdp,
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

    const firstGdpEvent = gdpEvents[0]!;
    const firstGrowthRate = (firstGdpEvent.event as ITypedEvent<{ gdpGrowthRate: number }>).payload.gdpGrowthRate;
    const expectedWeeklyGrowthRate = Math.pow(1 + expectedAnnualGrowthRate, 1 / 52) - 1;
    expect(firstGrowthRate).toBeCloseTo(expectedWeeklyGrowthRate, 15);

    const finalGdpEvent = gdpEvents[51]!;
    const finalGdp = (finalGdpEvent.event as ITypedEvent<{ newGdp: number }>).payload.newGdp;

    expect(finalGdp).toBeCloseTo(expectedFinalGdp, 5);

    // Applying the full annual rate on every weekly tick would compound far beyond one year's growth.
    expect(finalGdp).toBeLessThan(initialGdp * Math.pow(1 + expectedAnnualGrowthRate, 2));
  });

  it('should apply the exact 52-week conversion to a negative annual growth rate', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('economy-negative-growth-regression');
    const engine = new TickEngine(worldState, eventBus, timeline);

    // Zero production and 12% inflation produce an annual growth rate of -0.00006.
    const initialGdp = 1_000_000;
    const expectedAnnualGrowthRate = -0.00006;
    const expectedWeeklyGrowthRate = Math.pow(1 + expectedAnnualGrowthRate, 1 / 52) - 1;
    const expectedFinalGdp = initialGdp * (1 + expectedAnnualGrowthRate);

    worldState.createEntity('country-negative-growth' as EntityId, [
      {
        type: ECONOMIC_INDICATOR_TYPE,
        gdp: initialGdp,
        inflationRate: 0.12,
        treasury: 50_000,
        taxRate: 0.2,
      } as EconomicIndicatorComponent,
      {
        type: RESOURCE_PRODUCTION_TYPE,
        energyOutput: 0,
        foodOutput: 0,
        mineralsOutput: 0,
        industrialOutput: 0,
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

    // The same annual-to-weekly invariant must hold for negative growth rates.
    expect(finalGdp).toBeCloseTo(expectedFinalGdp, 5);
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
