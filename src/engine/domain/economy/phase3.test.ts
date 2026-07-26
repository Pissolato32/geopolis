import { describe, it, expect } from 'vitest';
import { WorldState } from '../../core/world-state/world-state.js';
import { EventBus } from '../../core/event-bus/event-bus.js';
import { Timeline } from '../../core/timeline/timeline.js';
import { TickEngine } from '../../core/tick-engine/tick-engine.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';
import {
  ECONOMIC_INDICATOR_TYPE,
  RESOURCE_PRODUCTION_TYPE,
  FINANCIAL_STATUS_TYPE,
  COMMODITY_IMPACT_TYPE,
  EconomicIndicatorComponent,
  FinancialStatusComponent,
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
  GOVERNMENT_STABILITY_TYPE,
  GovernmentStabilityComponent,
} from '../politics/components/politics.components.js';
import {
  MILITARY_FORCES_TYPE,
  MilitaryForcesComponent,
} from '../war/components/military-forces.component.js';
import { SanctionSystem } from './systems/sanction.system.js';
import { TradeSystem } from './systems/trade.system.js';
import { MarketSystem } from './systems/market.system.js';
import { CommodityImpactSystem } from './systems/commodity-impact.system.js';
import { EconomySystem } from './systems/economy.system.js';
import { AgentActionSystem } from '../../agents/systems/agent-action.system.js';
import { ITypedEvent } from '../../core/interfaces/event-bus.interface.js';
import {
  ECONOMY_SWIFT_DISCONNECT_EVENT,
  ECONOMY_SWIFT_RECONNECT_EVENT,
  ECONOMY_ASSET_FREEZE_EVENT,
  IEconomyAssetFreezePayload,
} from './events/sanction.events.js';
import {
  ECONOMY_TRADE_FLOW_EVENT,
  ECONOMY_BLOCKADE_EVENT,
  ECONOMY_COMMODITY_SHORTAGE_EVENT,
  IEconomyTradeFlowPayload,
} from './events/trade.events.js';
import {
  ECONOMY_STRATEGIC_COMMODITY_EVENT,
  IEconomyStrategicCommodityPayload,
} from './events/market.events.js';

describe('Phase 3 — Strategic Commodity Markets', () => {
  function setup() {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('phase3-commodity');
    const engine = new TickEngine(worldState, eventBus, timeline);
    return { timeline, eventBus, worldState, engine };
  }

  it('should model 4 strategic commodities with dynamic pricing', () => {
    const { timeline, worldState, engine } = setup();

    worldState.createEntity('country-sa' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 8000, inflationRate: 0.03, treasury: 500, taxRate: 0.2 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 500, foodOutput: 50, mineralsOutput: 20, industrialOutput: 100, technologyOutput: 30, rareEarthOutput: 10 },
    ]);

    const commodities = ['energy', 'food', 'technology', 'rare-earth'] as const;
    for (const c of commodities) {
      worldState.createEntity(`market-${c}` as EntityId, [
        { type: ECONOMY_MARKET_TYPE, resourceType: c, currentPrice: 100, totalSupply: 0, totalDemand: 0, priceVolatility: 0.3 },
      ]);
    }

    engine.registerSystem(new MarketSystem());
    engine.tick();

    const strategicEvents = timeline.query({ eventType: ECONOMY_STRATEGIC_COMMODITY_EVENT });
    expect(strategicEvents.length).toBeGreaterThanOrEqual(4);

    const commodities2 = strategicEvents.map(
      (e) => (e.event as ITypedEvent<IEconomyStrategicCommodityPayload>).payload.commodity,
    );
    expect(commodities2).toContain('petroleum');
    expect(commodities2).toContain('semiconductors');
    expect(commodities2).toContain('food_agriculture');
    expect(commodities2).toContain('rare_earth');
  });

  it('should fluctuate prices based on supply/demand deltas', () => {
    const { worldState, engine } = setup();

    worldState.createEntity('country-a' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 5000, inflationRate: 0.02, treasury: 300, taxRate: 0.2 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 100, foodOutput: 200, mineralsOutput: 50, industrialOutput: 80, technologyOutput: 50, rareEarthOutput: 30 },
    ]);

    worldState.createEntity('market-energy' as EntityId, [
      { type: ECONOMY_MARKET_TYPE, resourceType: 'energy', currentPrice: 50, totalSupply: 0, totalDemand: 0, priceVolatility: 0.5 },
    ]);

    engine.registerSystem(new MarketSystem());
    engine.tick();

    const market = worldState.getEntity('market-energy' as EntityId)
      ?.getComponent<MarketComponent>(ECONOMY_MARKET_TYPE);
    expect(market).toBeDefined();
    expect(market!.currentPrice).not.toBe(50);
  });

  it('should reduce supply and raise prices when producer is under embargo', () => {
    const { worldState, engine } = setup();

    worldState.createEntity('country-ru' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 15000, inflationRate: 0.05, treasury: 800, taxRate: 0.22 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 600, foodOutput: 100, mineralsOutput: 80, industrialOutput: 200, technologyOutput: 40, rareEarthOutput: 50 },
    ]);

    worldState.createEntity('market-energy' as EntityId, [
      { type: ECONOMY_MARKET_TYPE, resourceType: 'energy', currentPrice: 50, totalSupply: 0, totalDemand: 0, priceVolatility: 0.3 },
    ]);

    worldState.createEntity('sanction-oil-embargo' as EntityId, [
      { type: ECONOMY_SANCTION_TYPE, sourceCountryId: 'country-us' as EntityId, targetCountryId: 'country-ru' as EntityId, sanctionType: 'oil-embargo', severity: 0.9, startTick: 0 as any, isSwiftDisconnect: false, frozenAssetAmount: 0 },
    ]);

    engine.registerSystem(new MarketSystem());
    engine.registerSystem(new SanctionSystem());
    engine.tick();

    const market = worldState.getEntity('market-energy' as EntityId)
      ?.getComponent<MarketComponent>(ECONOMY_MARKET_TYPE);
    expect(market).toBeDefined();
    expect(market!.currentPrice).toBeGreaterThan(50);
  });
});

describe('Phase 3 — SWIFT Financial Sanctions & Asset Freezing', () => {
  function setup() {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('phase3-swift');
    const engine = new TickEngine(worldState, eventBus, timeline);
    return { timeline, eventBus, worldState, engine };
  }

  it('should disconnect SWIFT and apply trade penalty + inflation + fees', () => {
    const { timeline, worldState, engine } = setup();

    worldState.createEntity('country-ru' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 15000, inflationRate: 0.05, treasury: 800, taxRate: 0.22 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 300, foodOutput: 200, mineralsOutput: 50, industrialOutput: 100, technologyOutput: 30, rareEarthOutput: 20 },
      { type: FINANCIAL_STATUS_TYPE, isSwiftConnected: true, swiftDisconnectTick: null, frozenAssetAmount: 0, transactionFeeMultiplier: 1.0 },
    ]);
    worldState.createEntity('country-us' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 28700, inflationRate: 0.028, treasury: 1800, taxRate: 0.24 },
    ]);

    worldState.createEntity('market-energy' as EntityId, [
      { type: ECONOMY_MARKET_TYPE, resourceType: 'energy', currentPrice: 50, totalSupply: 0, totalDemand: 0, priceVolatility: 0.3 },
    ]);

    const routeId = 'route-ru-us-energy' as EntityId;
    worldState.createEntity(routeId, [
      { type: ECONOMY_TRADE_ROUTE_TYPE, sourceCountryId: 'country-ru' as EntityId, targetCountryId: 'country-us' as EntityId, resourceType: 'energy', volumePerTick: 10, isActive: true, establishedTick: 0 as any, blockadeLevel: 0 },
    ]);

    worldState.createEntity('sanction-swift' as EntityId, [
      { type: ECONOMY_SANCTION_TYPE, sourceCountryId: 'country-us' as EntityId, targetCountryId: 'country-ru' as EntityId, sanctionType: 'swift-disconnect', severity: 0.9, startTick: 0 as any, isSwiftDisconnect: true, frozenAssetAmount: 0 },
    ]);

    engine.registerSystem(new SanctionSystem());
    engine.registerSystem(new TradeSystem());

    engine.tick();

    const swiftEvents = timeline.query({ eventType: ECONOMY_SWIFT_DISCONNECT_EVENT });
    expect(swiftEvents).toHaveLength(1);

    const ruEntity = worldState.getEntity('country-ru' as EntityId);
    const financial = ruEntity?.getComponent<FinancialStatusComponent>(FINANCIAL_STATUS_TYPE);
    expect(financial?.isSwiftConnected).toBe(false);
    expect(financial?.transactionFeeMultiplier).toBeGreaterThan(1.0);

    const indicator = ruEntity?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
    expect(indicator?.inflationRate).toBeGreaterThan(0.05);

    const flowEvents = timeline.query({ eventType: ECONOMY_TRADE_FLOW_EVENT });
    expect(flowEvents).toHaveLength(1);
    const flowPayload = (flowEvents[0]!.event as ITypedEvent<IEconomyTradeFlowPayload>).payload;
    expect(flowPayload.value).toBeLessThan(10 * 50);
    const expectedPenalty = 10 * 50 * (1 - 0.3);
    expect(flowPayload.value).toBeCloseTo(expectedPenalty, 0);
  });

  it('should reconnect SWIFT when sanction is lifted and restore normal trade', () => {
    const { timeline, worldState, engine } = setup();

    worldState.createEntity('country-ru' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 15000, inflationRate: 0.05, treasury: 800, taxRate: 0.22 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 300, foodOutput: 200, mineralsOutput: 50, industrialOutput: 100, technologyOutput: 30, rareEarthOutput: 20 },
      { type: FINANCIAL_STATUS_TYPE, isSwiftConnected: true, swiftDisconnectTick: null, frozenAssetAmount: 0, transactionFeeMultiplier: 1.0 },
    ]);
    worldState.createEntity('country-us' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 28700, inflationRate: 0.028, treasury: 1800, taxRate: 0.24 },
    ]);

    worldState.createEntity('market-energy' as EntityId, [
      { type: ECONOMY_MARKET_TYPE, resourceType: 'energy', currentPrice: 50, totalSupply: 0, totalDemand: 0, priceVolatility: 0.3 },
    ]);

    const routeId = 'route-ru-us-energy' as EntityId;
    worldState.createEntity(routeId, [
      { type: ECONOMY_TRADE_ROUTE_TYPE, sourceCountryId: 'country-ru' as EntityId, targetCountryId: 'country-us' as EntityId, resourceType: 'energy', volumePerTick: 10, isActive: true, establishedTick: 0 as any, blockadeLevel: 0 },
    ]);

    const sanctionId = 'sanction-swift' as EntityId;
    worldState.createEntity(sanctionId, [
      { type: ECONOMY_SANCTION_TYPE, sourceCountryId: 'country-us' as EntityId, targetCountryId: 'country-ru' as EntityId, sanctionType: 'swift-disconnect', severity: 0.9, startTick: 0 as any, isSwiftDisconnect: true, frozenAssetAmount: 0 },
    ]);

    engine.registerSystem(new SanctionSystem());
    engine.registerSystem(new TradeSystem());

    engine.tick();
    expect(timeline.query({ eventType: ECONOMY_SWIFT_DISCONNECT_EVENT })).toHaveLength(1);

    worldState.removeEntity(sanctionId);

    engine.tick();
    const reconnectEvents = timeline.query({ eventType: ECONOMY_SWIFT_RECONNECT_EVENT });
    expect(reconnectEvents).toHaveLength(1);

    const financial = worldState.getEntity('country-ru' as EntityId)
      ?.getComponent<FinancialStatusComponent>(FINANCIAL_STATUS_TYPE);
    expect(financial?.isSwiftConnected).toBe(true);
    expect(financial?.transactionFeeMultiplier).toBe(1.0);
  });

  it('should freeze foreign central bank assets and emit asset-freeze event', () => {
    const { timeline, worldState, engine } = setup();

    worldState.createEntity('country-ru' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 15000, inflationRate: 0.05, treasury: 800, taxRate: 0.22 },
      { type: FINANCIAL_STATUS_TYPE, isSwiftConnected: true, swiftDisconnectTick: null, frozenAssetAmount: 0, transactionFeeMultiplier: 1.0 },
    ]);
    worldState.createEntity('country-us' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 28700, inflationRate: 0.028, treasury: 1800, taxRate: 0.24 },
    ]);

    worldState.createEntity('sanction-freeze' as EntityId, [
      { type: ECONOMY_SANCTION_TYPE, sourceCountryId: 'country-us' as EntityId, targetCountryId: 'country-ru' as EntityId, sanctionType: 'asset-freeze', severity: 0.8, startTick: 0 as any, isSwiftDisconnect: false, frozenAssetAmount: 300 },
    ]);

    engine.registerSystem(new SanctionSystem());
    engine.tick();

    const freezeEvents = timeline.query({ eventType: ECONOMY_ASSET_FREEZE_EVENT });
    expect(freezeEvents).toHaveLength(1);

    const freezePayload = (freezeEvents[0]!.event as ITypedEvent<IEconomyAssetFreezePayload>).payload;
    expect(freezePayload.frozenAmount).toBe(300);
    expect(freezePayload.targetCountryId).toBe('country-ru');

    const financial = worldState.getEntity('country-ru' as EntityId)
      ?.getComponent<FinancialStatusComponent>(FINANCIAL_STATUS_TYPE);
    expect(financial?.frozenAssetAmount).toBe(300);
  });

  it('should process SWIFT disconnect via agent action', () => {
    const { timeline, eventBus, worldState, engine } = setup();

    worldState.createEntity('country-ru' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 15000, inflationRate: 0.05, treasury: 800, taxRate: 0.22 },
      { type: FINANCIAL_STATUS_TYPE, isSwiftConnected: true, swiftDisconnectTick: null, frozenAssetAmount: 0, transactionFeeMultiplier: 1.0 },
    ]);
    worldState.createEntity('country-us' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 28700, inflationRate: 0.028, treasury: 1800, taxRate: 0.24 },
    ]);

    const actionSys = new AgentActionSystem();
    engine.registerSystem(actionSys);
    engine.registerSystem(new SanctionSystem());

    eventBus.publish(
      'economy.swift-disconnect',
      { targetCountryId: 'country-ru', severity: 0.9 },
      'test',
      'country-us' as EntityId,
    );
    eventBus.flush();

    const sanctions = worldState.getEntitiesByComponent(ECONOMY_SANCTION_TYPE);
    expect(sanctions).toHaveLength(1);
    const comp = sanctions[0]!.getComponent<SanctionComponent>(ECONOMY_SANCTION_TYPE);
    expect(comp?.sanctionType).toBe('swift-disconnect');

    engine.tick();
    expect(timeline.query({ eventType: ECONOMY_SWIFT_DISCONNECT_EVENT })).toHaveLength(1);
  });
});

describe('Phase 3 — Dynamic Embargoes & Supply Bottlenecks', () => {
  function setup() {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('phase3-embargo');
    const engine = new TickEngine(worldState, eventBus, timeline);
    return { timeline, eventBus, worldState, engine };
  }

  it('should block trade routes with high blockade level and emit blockade event', () => {
    const { timeline, worldState, engine } = setup();

    worldState.createEntity('country-a' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 5000, inflationRate: 0.02, treasury: 300, taxRate: 0.2 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 200, foodOutput: 100, mineralsOutput: 50, industrialOutput: 80, technologyOutput: 20, rareEarthOutput: 10 },
    ]);
    worldState.createEntity('country-b' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 8000, inflationRate: 0.03, treasury: 500, taxRate: 0.22 },
    ]);

    worldState.createEntity('market-energy' as EntityId, [
      { type: ECONOMY_MARKET_TYPE, resourceType: 'energy', currentPrice: 50, totalSupply: 0, totalDemand: 0, priceVolatility: 0.3 },
    ]);

    const routeId = 'route-a-b-energy' as EntityId;
    worldState.createEntity(routeId, [
      { type: ECONOMY_TRADE_ROUTE_TYPE, sourceCountryId: 'country-a' as EntityId, targetCountryId: 'country-b' as EntityId, resourceType: 'energy', volumePerTick: 10, isActive: true, establishedTick: 0 as any, blockadeLevel: 0.8 },
    ]);

    engine.registerSystem(new TradeSystem());
    engine.tick();

    const blockadeEvents = timeline.query({ eventType: ECONOMY_BLOCKADE_EVENT });
    expect(blockadeEvents.length).toBeGreaterThanOrEqual(1);

    const route = worldState.getEntity(routeId)
      ?.getComponent<TradeRouteComponent>(ECONOMY_TRADE_ROUTE_TYPE);
    expect(route?.isActive).toBe(false);

    expect(timeline.query({ eventType: ECONOMY_TRADE_FLOW_EVENT })).toHaveLength(0);
  });

  it('should reduce trade value for partial blockades', () => {
    const { timeline, worldState, engine } = setup();

    worldState.createEntity('country-a' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 5000, inflationRate: 0.02, treasury: 300, taxRate: 0.2 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 200, foodOutput: 100, mineralsOutput: 50, industrialOutput: 80, technologyOutput: 20, rareEarthOutput: 10 },
    ]);
    worldState.createEntity('country-b' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 8000, inflationRate: 0.03, treasury: 500, taxRate: 0.22 },
    ]);

    worldState.createEntity('market-energy' as EntityId, [
      { type: ECONOMY_MARKET_TYPE, resourceType: 'energy', currentPrice: 50, totalSupply: 0, totalDemand: 0, priceVolatility: 0.3 },
    ]);

    const routeId = 'route-a-b-energy' as EntityId;
    worldState.createEntity(routeId, [
      { type: ECONOMY_TRADE_ROUTE_TYPE, sourceCountryId: 'country-a' as EntityId, targetCountryId: 'country-b' as EntityId, resourceType: 'energy', volumePerTick: 10, isActive: true, establishedTick: 0 as any, blockadeLevel: 0.3 },
    ]);

    engine.registerSystem(new TradeSystem());
    engine.tick();

    const flowEvents = timeline.query({ eventType: ECONOMY_TRADE_FLOW_EVENT });
    expect(flowEvents).toHaveLength(1);
    const payload = (flowEvents[0]!.event as ITypedEvent<IEconomyTradeFlowPayload>).payload;
    expect(payload.value).toBeLessThan(10 * 50);
    expect(payload.value).toBeCloseTo(10 * 50 * (1 - 0.3), 0);

    const blockadeEvents = timeline.query({ eventType: ECONOMY_BLOCKADE_EVENT });
    expect(blockadeEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('should apply stability penalty and double recruitment costs on food/energy deficit', () => {
    const { timeline, worldState, engine } = setup();

    worldState.createEntity('country-x' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 5000, inflationRate: 0.02, treasury: 300, taxRate: 0.2 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 10, foodOutput: 10, mineralsOutput: 50, industrialOutput: 80, technologyOutput: 20, rareEarthOutput: 10 },
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.8, approvalRating: 0.5, militaryLoyalty: 0.7 },
      { type: MILITARY_FORCES_TYPE, ownerCountryId: 'country-x' as EntityId, totalPersonnel: 50000, forceLimit: 100000, readiness: 0.6, morale: 0.7, fuelReserves: 1000 },
    ]);

    engine.registerSystem(new TradeSystem());
    engine.registerSystem(new CommodityImpactSystem());
    engine.tick();

    const shortageEvents = timeline.query({ eventType: ECONOMY_COMMODITY_SHORTAGE_EVENT });
    expect(shortageEvents.length).toBeGreaterThanOrEqual(2);

    const impact = worldState.getEntity('country-x' as EntityId)
      ?.getComponent<import('./components/economy.components.js').CommodityImpactComponent>(COMMODITY_IMPACT_TYPE);
    expect(impact).toBeDefined();
    expect(impact!.stabilityPenalty).toBe(0.1);
    expect(impact!.recruitmentCostMultiplier).toBe(2.0);

    const stability = worldState.getEntity('country-x' as EntityId)
      ?.getComponent<GovernmentStabilityComponent>(GOVERNMENT_STABILITY_TYPE);
    expect(stability?.stabilityIndex).toBeLessThan(0.8);

    const forces = worldState.getEntity('country-x' as EntityId)
      ?.getComponent<MilitaryForcesComponent>(MILITARY_FORCES_TYPE);
    expect(forces?.forceLimit).toBeLessThan(100000);
  });

  it('should run full Phase 3 pipeline: SWIFT disconnect → trade penalty → market shock → scarcity', () => {
    const { timeline, worldState, engine } = setup();

    worldState.createEntity('country-ru' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 15000, inflationRate: 0.05, treasury: 800, taxRate: 0.22 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 400, foodOutput: 150, mineralsOutput: 50, industrialOutput: 200, technologyOutput: 30, rareEarthOutput: 40 },
      { type: FINANCIAL_STATUS_TYPE, isSwiftConnected: true, swiftDisconnectTick: null, frozenAssetAmount: 0, transactionFeeMultiplier: 1.0 },
    ]);
    worldState.createEntity('country-us' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 28700, inflationRate: 0.028, treasury: 1800, taxRate: 0.24 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 200, foodOutput: 400, mineralsOutput: 100, industrialOutput: 500, technologyOutput: 300, rareEarthOutput: 20 },
    ]);

    for (const c of ['energy', 'food', 'technology', 'rare-earth'] as const) {
      worldState.createEntity(`market-${c}` as EntityId, [
        { type: ECONOMY_MARKET_TYPE, resourceType: c, currentPrice: 100, totalSupply: 0, totalDemand: 0, priceVolatility: 0.3 },
      ]);
    }

    const routeId = 'route-ru-us-energy' as EntityId;
    worldState.createEntity(routeId, [
      { type: ECONOMY_TRADE_ROUTE_TYPE, sourceCountryId: 'country-ru' as EntityId, targetCountryId: 'country-us' as EntityId, resourceType: 'energy', volumePerTick: 10, isActive: true, establishedTick: 0 as any, blockadeLevel: 0 },
    ]);

    worldState.createEntity('sanction-swift' as EntityId, [
      { type: ECONOMY_SANCTION_TYPE, sourceCountryId: 'country-us' as EntityId, targetCountryId: 'country-ru' as EntityId, sanctionType: 'swift-disconnect', severity: 0.9, startTick: 0 as any, isSwiftDisconnect: true, frozenAssetAmount: 0 },
    ]);

    engine.registerSystem(new SanctionSystem());
    engine.registerSystem(new TradeSystem());
    engine.registerSystem(new MarketSystem());

    let threw = false;
    try { engine.runTicks(10); } catch { threw = true; }
    expect(threw).toBe(false);

    expect(timeline.query({ eventType: ECONOMY_SWIFT_DISCONNECT_EVENT })).toHaveLength(1);
    expect(timeline.query({ eventType: ECONOMY_TRADE_FLOW_EVENT }).length).toBeGreaterThan(0);
    expect(timeline.query({ eventType: ECONOMY_STRATEGIC_COMMODITY_EVENT }).length).toBeGreaterThan(0);

    const financial = worldState.getEntity('country-ru' as EntityId)
      ?.getComponent<FinancialStatusComponent>(FINANCIAL_STATUS_TYPE);
    expect(financial?.isSwiftConnected).toBe(false);
  });

  it('should run 100 ticks with full Phase 3 systems without errors', () => {
    const { worldState, engine } = setup();

    worldState.createEntity('country-a' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 5000, inflationRate: 0.02, treasury: 300, taxRate: 0.2 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 200, foodOutput: 100, mineralsOutput: 50, industrialOutput: 80, technologyOutput: 40, rareEarthOutput: 30 },
      { type: FINANCIAL_STATUS_TYPE, isSwiftConnected: true, swiftDisconnectTick: null, frozenAssetAmount: 0, transactionFeeMultiplier: 1.0 },
    ]);
    worldState.createEntity('country-b' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 8000, inflationRate: 0.03, treasury: 500, taxRate: 0.22 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 100, foodOutput: 300, mineralsOutput: 80, industrialOutput: 200, technologyOutput: 60, rareEarthOutput: 10 },
      { type: FINANCIAL_STATUS_TYPE, isSwiftConnected: true, swiftDisconnectTick: null, frozenAssetAmount: 0, transactionFeeMultiplier: 1.0 },
    ]);

    for (const c of ['energy', 'food', 'technology', 'rare-earth'] as const) {
      worldState.createEntity(`market-${c}` as EntityId, [
        { type: ECONOMY_MARKET_TYPE, resourceType: c, currentPrice: 100, totalSupply: 0, totalDemand: 0, priceVolatility: 0.3 },
      ]);
    }

    worldState.createEntity('route-a-b' as EntityId, [
      { type: ECONOMY_TRADE_ROUTE_TYPE, sourceCountryId: 'country-a' as EntityId, targetCountryId: 'country-b' as EntityId, resourceType: 'energy', volumePerTick: 8, isActive: true, establishedTick: 0 as any, blockadeLevel: 0 },
    ]);

    engine.registerSystem(new SanctionSystem());
    engine.registerSystem(new TradeSystem());
    engine.registerSystem(new MarketSystem());
    engine.registerSystem(new EconomySystem());
    engine.registerSystem(new CommodityImpactSystem());

    let results;
    expect(() => { results = engine.runTicks(100); }).not.toThrow();
    expect(results).toHaveLength(100);
  });
});
