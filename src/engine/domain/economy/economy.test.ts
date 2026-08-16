import { GOVERNMENT_STABILITY_TYPE, GovernmentStabilityComponent } from '../politics/components/politics.components.js';
import { TradeSystem } from './systems/trade.system.js';
import { TradeRouteComponent, ECONOMY_TRADE_ROUTE_TYPE } from './components/trade.components.js';
import { ECONOMY_TAX_COLLECTED_EVENT } from './events/economy.events.js';
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
    expect(timeline.getEventCount()).toBe(15); // 5 GDP + 5 shortage + 5 tax events

    const gdpEvents = timeline.query({ eventType: ECONOMY_GDP_UPDATED_EVENT });
    expect(gdpEvents).toHaveLength(5);

    const shortageEvents = timeline.query({ eventType: ECONOMY_RESOURCE_SHORTAGE_EVENT });
    expect(shortageEvents).toHaveLength(5);
  });
});

  it('should calculate exactly 1 weekly tax amount over 1 tick and not introduce 0.005 factor', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('tax-1-tick');
    const engine = new TickEngine(worldState, eventBus, timeline);

    const startTreasury = 100_000;
    const gdp = 1_000_000;
    const taxRate = 0.25;
    const stabilityIndex = 0.6;

    worldState.createEntity('country-tax' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp, inflationRate: 0, treasury: startTreasury, taxRate } as EconomicIndicatorComponent,
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex, approvalRating: 0.5, militaryLoyalty: 0.5, governmentType: 'democracy', regimeStabilityTicks: 0 } as GovernmentStabilityComponent,
    ]);

    engine.registerSystem(new EconomySystem());
    engine.tick();

    const taxEvents = timeline.query({ eventType: ECONOMY_TAX_COLLECTED_EVENT });
    expect(taxEvents).toHaveLength(1);

    const entity = worldState.getEntity('country-tax' as EntityId);
    const indicator = entity?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
    const currentTreasury = typeof indicator?.treasury === 'bigint' ? Number(indicator.treasury) : indicator?.treasury;

    const expectedAnnualTax = gdp * taxRate * stabilityIndex; // 1M * 0.25 * 0.6 = 150k
    const expectedWeeklyTax = expectedAnnualTax / 52; // 150k / 52 = 2884.615...

    expect(currentTreasury).toBeCloseTo(startTreasury + expectedWeeklyTax, 2);

    // Ensure historical 0.005 factor (which would give 750) is NOT used
    expect(currentTreasury! - startTreasury).not.toBeCloseTo(gdp * taxRate * stabilityIndex * 0.005, 2);
  });

  it('should not charge annual taxation every tick over 52 ticks', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('tax-52-ticks');
    const engine = new TickEngine(worldState, eventBus, timeline);

    const startTreasury = 100_000;
    const gdp = 1_000_000;
    const taxRate = 0.25;
    const stabilityIndex = 0.6;

    worldState.createEntity('country-tax' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp, inflationRate: 0, treasury: startTreasury, taxRate } as EconomicIndicatorComponent,
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex, approvalRating: 0.5, militaryLoyalty: 0.5, governmentType: 'democracy', regimeStabilityTicks: 0 } as GovernmentStabilityComponent,
    ]);

    engine.registerSystem(new EconomySystem());
    engine.runTicks(52);

    const entity = worldState.getEntity('country-tax' as EntityId);
    const indicator = entity?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
    const currentTreasury = typeof indicator?.treasury === 'bigint' ? Number(indicator.treasury) : indicator?.treasury;

    const taxCollected = currentTreasury! - startTreasury;
    const initialAnnualTax = gdp * taxRate * stabilityIndex; // 150k

    // Should be approximately equal to 1 annual tax over 52 ticks, varying slightly due to compounding GDP growth
    expect(taxCollected).toBeGreaterThan(initialAnnualTax * 0.95);
    expect(taxCollected).toBeLessThan(initialAnnualTax * 1.50);

    // The old bug would result in 52 * annual tax = 7.8M
    expect(taxCollected).toBeLessThan(initialAnnualTax * 52);
  });

  it('should generate zero tax revenue if tax rate is zero', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('tax-zero');
    const engine = new TickEngine(worldState, eventBus, timeline);

    const startTreasury = 100_000;

    worldState.createEntity('country-tax' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 1_000_000, inflationRate: 0, treasury: startTreasury, taxRate: 0 } as EconomicIndicatorComponent,
    ]);

    engine.registerSystem(new EconomySystem());
    engine.tick();

    const entity = worldState.getEntity('country-tax' as EntityId);
    const indicator = entity?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
    const currentTreasury = typeof indicator?.treasury === 'bigint' ? Number(indicator.treasury) : indicator?.treasury;

    expect(currentTreasury).toBe(startTreasury);
  });

  it('should persist both Trade and Tax treasury deltas in the same tick without overwrite', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('tax-trade-coexist');
    const engine = new TickEngine(worldState, eventBus, timeline);

    const startTreasury = 100_000;

    worldState.createEntity('country-src' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 1_000_000, inflationRate: 0, treasury: startTreasury, taxRate: 0.25 } as EconomicIndicatorComponent,
    ]);
    worldState.createEntity('country-tgt' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 1_000_000, inflationRate: 0, treasury: 100_000, taxRate: 0.25 } as EconomicIndicatorComponent,
    ]);
    worldState.createEntity('route' as EntityId, [
      { type: ECONOMY_TRADE_ROUTE_TYPE, sourceCountryId: 'country-src' as EntityId, targetCountryId: 'country-tgt' as EntityId, resourceType: 'energy', volumePerTick: 10, isActive: true, establishedTick: 0 as any, blockadeLevel: 0 } as TradeRouteComponent,
    ]);

    engine.registerSystem(new TradeSystem());
    engine.registerSystem(new EconomySystem());
    engine.tick();

    const entity = worldState.getEntity('country-src' as EntityId);
    const indicator = entity?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
    const currentTreasury = typeof indicator?.treasury === 'bigint' ? Number(indicator.treasury) : indicator?.treasury;

    // Trade delta: 10 volume * 100 base price = 1000
    // Tax delta: 1_000_000 * 0.25 * 1.0 (default stability) / 52 = 4807.69...
    // Total expected: 100_000 + 1000 + 4807.69... = 105807.69...
    expect(currentTreasury).toBeCloseTo(startTreasury + 1000 + (1_000_000 * 0.25 * 1.0 / 52), 2);
});
