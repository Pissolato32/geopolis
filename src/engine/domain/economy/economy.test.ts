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
import { ECONOMY_GDP_UPDATED_EVENT, ECONOMY_RESOURCE_SHORTAGE_EVENT, ECONOMY_TAX_COLLECTED_EVENT } from './events/economy.events.js';
import { GOVERNMENT_STABILITY_TYPE, GovernmentStabilityComponent } from '../politics/components/politics.components.js';
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

  it('should collect exactly one week of tax revenue and emit exactly one tax event', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('economy-tax-week');
    const engine = new TickEngine(worldState, eventBus, timeline);

    worldState.createEntity('country-tax' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 5200, inflationRate: 0, treasury: 100, taxRate: 0.2 } as EconomicIndicatorComponent,
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 0, foodOutput: 0, mineralsOutput: 0, industrialOutput: 0 } as ResourceProductionComponent,
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 1, approvalRating: 0.5, militaryLoyalty: 0.5, governmentType: 'democracy', regimeStabilityTicks: 1 } as GovernmentStabilityComponent,
    ]);

    engine.registerSystem(new EconomySystem());
    engine.tick();

    const taxEvents = timeline.query({ eventType: ECONOMY_TAX_COLLECTED_EVENT });
    expect(taxEvents).toHaveLength(1);
    expect((taxEvents[0]!.event as ITypedEvent<{ taxRevenue: number }>).payload.taxRevenue).toBeCloseTo(20, 12);

    const indicator = worldState.getEntity('country-tax' as EntityId)?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
    expect(indicator?.treasury).toBeCloseTo(120, 12);
  });

  it('should accumulate exactly 52 weekly tax collections without annual-per-tick taxation', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('economy-tax-year');
    const engine = new TickEngine(worldState, eventBus, timeline);

    worldState.createEntity('country-tax-year' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 5200, inflationRate: 0, treasury: 100, taxRate: 0.2 } as EconomicIndicatorComponent,
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 0, foodOutput: 0, mineralsOutput: 0, industrialOutput: 0 } as ResourceProductionComponent,
    ]);

    engine.registerSystem(new EconomySystem());
    engine.runTicks(52);

    const taxEvents = timeline.query({ eventType: ECONOMY_TAX_COLLECTED_EVENT });
    expect(taxEvents).toHaveLength(52);
    const totalTax = taxEvents.reduce((sum, event) => sum + (event.event as ITypedEvent<{ taxRevenue: number }>).payload.taxRevenue, 0);
    expect(totalTax).toBeCloseTo(1040, 10);

    const indicator = worldState.getEntity('country-tax-year' as EntityId)?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
    expect(indicator?.treasury).toBeCloseTo(1140, 10);
    expect(indicator?.treasury).toBeLessThan(100 + 5200 * 0.2);
  });

  it('should apply stability to tax revenue and collect zero tax at zero tax rate', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('economy-tax-stability');
    const engine = new TickEngine(worldState, eventBus, timeline);

    worldState.createEntity('country-low-stability' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 5200, inflationRate: 0, treasury: 100, taxRate: 0.2 } as EconomicIndicatorComponent,
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.5, approvalRating: 0.5, militaryLoyalty: 0.5, governmentType: 'authoritarian', regimeStabilityTicks: 1 } as GovernmentStabilityComponent,
    ]);
    worldState.createEntity('country-zero-tax' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 5200, inflationRate: 0, treasury: 100, taxRate: 0 } as EconomicIndicatorComponent,
    ]);

    engine.registerSystem(new EconomySystem());
    engine.tick();

    const lowStability = worldState.getEntity('country-low-stability' as EntityId)?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
    const zeroTax = worldState.getEntity('country-zero-tax' as EntityId)?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
    expect(lowStability?.treasury).toBeCloseTo(110, 12);
    expect(zeroTax?.treasury).toBe(100);
    expect(timeline.query({ eventType: ECONOMY_TAX_COLLECTED_EVENT })).toHaveLength(1);
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
    expect(timeline.query({ eventType: ECONOMY_GDP_UPDATED_EVENT })).toHaveLength(5);
    expect(timeline.query({ eventType: ECONOMY_RESOURCE_SHORTAGE_EVENT })).toHaveLength(5);
    expect(timeline.query({ eventType: ECONOMY_TAX_COLLECTED_EVENT })).toHaveLength(5);
  });
});
