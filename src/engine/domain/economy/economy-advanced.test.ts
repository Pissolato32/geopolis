import { describe, it, expect } from 'vitest';
import { WorldState } from '../../core/world-state/world-state.js';
import { EventBus } from '../../core/event-bus/event-bus.js';
import { Timeline } from '../../core/timeline/timeline.js';
import { TickEngine } from '../../core/tick-engine/tick-engine.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';
import { EconomySystem } from './systems/economy.system.js';
import { TradeSystem } from './systems/trade.system.js';
import { MarketSystem } from './systems/market.system.js';
import { SanctionSystem } from './systems/sanction.system.js';
import { ITypedEvent } from '../../core/interfaces/event-bus.interface.js';
import {
  ECONOMIC_INDICATOR_TYPE,
  RESOURCE_PRODUCTION_TYPE,
  EconomicIndicatorComponent,
} from './components/economy.components.js';
import {
  ECONOMY_TRADE_ROUTE_TYPE,
  TradeRouteComponent,
} from './components/trade.components.js';
import {
  ECONOMY_MARKET_TYPE,
  MarketComponent,
} from './components/market.components.js';
import {
  ECONOMY_SANCTION_TYPE,
  SanctionComponent,
} from './components/sanction.components.js';
import {
  ECONOMY_TRADE_FLOW_EVENT,
  ECONOMY_TRADE_ROUTE_BLOCKED_EVENT,
} from './events/trade.events.js';
import {
  ECONOMY_PRICE_UPDATED_EVENT,
  ECONOMY_MARKET_CRASH_EVENT,
} from './events/market.events.js';

describe('Advanced Economy — Trade, Market & Sanctions Integration', () => {
  it('should execute trade flow and credit source treasury', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('trade-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    worldState.createEntity('country-br' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 2000, inflationRate: 0.04, treasury: 150, taxRate: 0.2 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 100, foodOutput: 200, mineralsOutput: 50, industrialOutput: 80 },
    ]);

    worldState.createEntity('country-us' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 28700, inflationRate: 0.028, treasury: 1800, taxRate: 0.24 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 300, foodOutput: 400, mineralsOutput: 100, industrialOutput: 500 },
    ]);

    worldState.createEntity('market-energy' as EntityId, [
      { type: ECONOMY_MARKET_TYPE, resourceType: 'energy', currentPrice: 50, totalSupply: 0, totalDemand: 0, priceVolatility: 0.3 },
    ]);

    const routeId = 'route-br-us-energy' as EntityId;
    worldState.createEntity(routeId, [
      {
        type: ECONOMY_TRADE_ROUTE_TYPE,
        sourceCountryId: 'country-br' as EntityId,
        targetCountryId: 'country-us' as EntityId,
        resourceType: 'energy',
        volumePerTick: 10,
        isActive: true,
        establishedTick: 0 as any,
      } as TradeRouteComponent,
    ]);

    engine.registerSystem(new TradeSystem());
    engine.registerSystem(new EconomySystem());
    engine.tick();

    const flowEvents = timeline.query({ eventType: ECONOMY_TRADE_FLOW_EVENT });
    expect(flowEvents).toHaveLength(1);

    const payload = (flowEvents[0]!.event as ITypedEvent<{ routeId: string; sourceCountryId: string; value: number }>).payload;
    expect(payload.sourceCountryId).toBe('country-br');
    expect(payload.value).toBe(500); // 10 volume * 50 price

    const brEntity = worldState.getEntity('country-br' as EntityId);
    const brIndicator = brEntity?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
    expect(brIndicator?.treasury).toBe(650); // 150 + 500
  });

  it('should not emit trade-flow for inactive routes', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('inactive-route-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    worldState.createEntity('country-br' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 2000, inflationRate: 0.04, treasury: 150, taxRate: 0.2 },
    ]);

    worldState.createEntity(('route-inactive' as EntityId), [
      {
        type: ECONOMY_TRADE_ROUTE_TYPE,
        sourceCountryId: 'country-br' as EntityId,
        targetCountryId: 'country-br' as EntityId,
        resourceType: 'energy',
        volumePerTick: 10,
        isActive: false,
        establishedTick: 0 as any,
      } as TradeRouteComponent,
    ]);

    engine.registerSystem(new TradeSystem());
    engine.tick();

    expect(timeline.query({ eventType: ECONOMY_TRADE_FLOW_EVENT })).toHaveLength(0);
  });

  it('should update market prices based on supply/demand and emit price-updated', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('market-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    worldState.createEntity('country-br' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 2000, inflationRate: 0.04, treasury: 150, taxRate: 0.2 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 300, foodOutput: 200, mineralsOutput: 50, industrialOutput: 80 },
    ]);

    worldState.createEntity('market-energy' as EntityId, [
      { type: ECONOMY_MARKET_TYPE, resourceType: 'energy', currentPrice: 50, totalSupply: 0, totalDemand: 0, priceVolatility: 0.3 },
    ]);

    engine.registerSystem(new MarketSystem());
    engine.tick();

    const priceEvents = timeline.query({ eventType: ECONOMY_PRICE_UPDATED_EVENT });
    expect(priceEvents).toHaveLength(1);

    const marketEntity = worldState.getEntity('market-energy' as EntityId);
    const market = marketEntity?.getComponent<MarketComponent>(ECONOMY_MARKET_TYPE);
    expect(market).toBeDefined();
    expect(market!.totalSupply).toBe(300);
    expect(market!.totalDemand).toBe(500);

    // supply (300) < demand (500), so price should rise
    expect(market!.currentPrice).toBeGreaterThan(50);
  });

  it('should emit market-crash when price crosses threshold', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('crash-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    worldState.createEntity('country-br' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 2000, inflationRate: 0.04, treasury: 150, taxRate: 0.2 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 10, foodOutput: 200, mineralsOutput: 50, industrialOutput: 80 },
    ]);

    worldState.createEntity('market-energy' as EntityId, [
      { type: ECONOMY_MARKET_TYPE, resourceType: 'energy', currentPrice: 50, totalSupply: 0, totalDemand: 0, priceVolatility: 2.0 },
    ]);

    engine.registerSystem(new MarketSystem());
    engine.tick();

    const crashEvents = timeline.query({ eventType: ECONOMY_MARKET_CRASH_EVENT });
    expect(crashEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('should block trade routes under sanction and emit trade-route-blocked', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('sanction-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    worldState.createEntity('country-br' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 2000, inflationRate: 0.04, treasury: 150, taxRate: 0.2 },
    ]);
    worldState.createEntity('country-us' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 28700, inflationRate: 0.028, treasury: 1800, taxRate: 0.24 },
    ]);

    const routeId = 'route-br-us-energy' as EntityId;
    worldState.createEntity(routeId, [
      {
        type: ECONOMY_TRADE_ROUTE_TYPE,
        sourceCountryId: 'country-br' as EntityId,
        targetCountryId: 'country-us' as EntityId,
        resourceType: 'energy',
        volumePerTick: 10,
        isActive: true,
        establishedTick: 0 as any,
      } as TradeRouteComponent,
    ]);

    worldState.createEntity('sanction-us-vs-br' as EntityId, [
      {
        type: ECONOMY_SANCTION_TYPE,
        sourceCountryId: 'country-us' as EntityId,
        targetCountryId: 'country-br' as EntityId,
        sanctionType: 'trade-embargo',
        severity: 0.8,
        startTick: 0 as any,
      } as SanctionComponent,
    ]);

    engine.registerSystem(new SanctionSystem());
    engine.registerSystem(new TradeSystem());
    engine.tick();

    const blockedEvents = timeline.query({ eventType: ECONOMY_TRADE_ROUTE_BLOCKED_EVENT });
    expect(blockedEvents).toHaveLength(1);

    const routeEntity = worldState.getEntity(routeId);
    const route = routeEntity?.getComponent<TradeRouteComponent>(ECONOMY_TRADE_ROUTE_TYPE);
    expect(route?.isActive).toBe(false);

    const flowEvents = timeline.query({ eventType: ECONOMY_TRADE_FLOW_EVENT });
    expect(flowEvents).toHaveLength(0);
  });

  it('should run full pipeline: sanctions block → trade stops → market adjusts', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('full-pipeline');
    const engine = new TickEngine(worldState, eventBus, timeline);

    worldState.createEntity('country-br' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 2000, inflationRate: 0.04, treasury: 150, taxRate: 0.2 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 300, foodOutput: 200, mineralsOutput: 50, industrialOutput: 80 },
    ]);
    worldState.createEntity('country-us' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 28700, inflationRate: 0.028, treasury: 1800, taxRate: 0.24 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 100, foodOutput: 400, mineralsOutput: 100, industrialOutput: 500 },
    ]);

    worldState.createEntity('market-energy' as EntityId, [
      { type: ECONOMY_MARKET_TYPE, resourceType: 'energy', currentPrice: 50, totalSupply: 0, totalDemand: 0, priceVolatility: 0.3 },
    ]);

    const routeId = 'route-br-us-energy' as EntityId;
    worldState.createEntity(routeId, [
      {
        type: ECONOMY_TRADE_ROUTE_TYPE,
        sourceCountryId: 'country-br' as EntityId,
        targetCountryId: 'country-us' as EntityId,
        resourceType: 'energy',
        volumePerTick: 10,
        isActive: true,
        establishedTick: 0 as any,
      } as TradeRouteComponent,
    ]);

    worldState.createEntity('sanction-us-vs-br' as EntityId, [
      {
        type: ECONOMY_SANCTION_TYPE,
        sourceCountryId: 'country-us' as EntityId,
        targetCountryId: 'country-br' as EntityId,
        sanctionType: 'trade-embargo',
        severity: 0.8,
        startTick: 0 as any,
      } as SanctionComponent,
    ]);

    engine.registerSystem(new SanctionSystem());
    engine.registerSystem(new TradeSystem());
    engine.registerSystem(new MarketSystem());

    engine.tick();

    // Sanction blocked the route
    expect(timeline.query({ eventType: ECONOMY_TRADE_ROUTE_BLOCKED_EVENT })).toHaveLength(1);
    expect(timeline.query({ eventType: ECONOMY_TRADE_FLOW_EVENT })).toHaveLength(0);

    // Market still updates
    expect(timeline.query({ eventType: ECONOMY_PRICE_UPDATED_EVENT }).length).toBeGreaterThanOrEqual(1);

    // Treasury unchanged because trade was blocked
    const brEntity = worldState.getEntity('country-br' as EntityId);
    const brIndicator = brEntity?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
    expect(brIndicator?.treasury).toBe(150);
  });
});
