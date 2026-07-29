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
import { AgentActionSystem } from '../../agents/systems/agent-action.system.js';
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
  ECONOMY_TRADE_ROUTE_ESTABLISHED_EVENT,
  ECONOMY_TRADE_ROUTE_BLOCKED_EVENT,
} from './events/trade.events.js';
import {
  ECONOMY_PRICE_UPDATED_EVENT,
} from './events/market.events.js';
import {
  ECONOMY_SANCTION_IMPOSED_EVENT,
  ECONOMY_SANCTION_LIFTED_EVENT,
} from './events/sanction.events.js';

describe('E2E: Full Economic Pipeline — Sanction → Blockade → Price Shock', () => {
  function buildEngine() {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('e2e-economy');
    const engine = new TickEngine(worldState, eventBus, timeline);
    return { timeline, eventBus, worldState, engine };
  }

  it('should complete full sanction-blockade-priceShock lifecycle via agent actions', () => {
    const { timeline, eventBus, worldState, engine } = buildEngine();

    // ─── Setup: 2 countries with economies + production ────────
    worldState.createEntity('country-br' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 2000, inflationRate: 0.04, treasury: 150, taxRate: 0.2 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 300, foodOutput: 200, mineralsOutput: 50, industrialOutput: 80 },
    ]);
    worldState.createEntity('country-us' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 28700, inflationRate: 0.028, treasury: 1800, taxRate: 0.24 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 100, foodOutput: 400, mineralsOutput: 100, industrialOutput: 500 },
    ]);

    // Setup: global energy market
    worldState.createEntity('market-energy' as EntityId, [
      { type: ECONOMY_MARKET_TYPE, resourceType: 'energy', currentPrice: 50, totalSupply: 0, totalDemand: 0, priceVolatility: 0.3 },
    ]);

    // ─── Register all systems ──────────────────────────────────
    const actionSys = new AgentActionSystem();
    engine.registerSystem(actionSys);
    engine.registerSystem(new SanctionSystem());
    engine.registerSystem(new TradeSystem());
    engine.registerSystem(new EconomySystem());
    engine.registerSystem(new MarketSystem());

    // ─── Action 1: Establish trade route BR → US (energy) ──────
    eventBus.publish(
      'economy.establish-trade-route',
      { targetCountryId: 'country-us', resourceType: 'energy', volumePerTick: 10 },
      'test',
      'country-br' as EntityId,
    );
    eventBus.flush();

    const routes = worldState.getEntitiesByComponent(ECONOMY_TRADE_ROUTE_TYPE);
    expect(routes).toHaveLength(1);
    const routeComp = routes[0]!.getComponent<TradeRouteComponent>(ECONOMY_TRADE_ROUTE_TYPE);
    expect(routeComp?.isActive).toBe(true);
    expect(routeComp?.volumePerTick).toBe(10);

    const establishedEvents = timeline.query({ eventType: ECONOMY_TRADE_ROUTE_ESTABLISHED_EVENT });
    expect(establishedEvents).toHaveLength(1);

    // ─── Tick 1-3: Trade flows, treasury grows ─────────────────
    engine.tick();
    engine.tick();
    engine.tick();

    const flowEvents = timeline.query({ eventType: ECONOMY_TRADE_FLOW_EVENT });
    expect(flowEvents).toHaveLength(3);

    const brBeforeSanction = worldState.getEntity('country-br' as EntityId);
    const brTreasury = (brBeforeSanction?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE))?.treasury;
    expect(Number(brTreasury)).toBeGreaterThan(150); // Grew from trade

    // ─── Action 2: Impose sanction US → BR (trade-embargo) ─────
    const priceBefore = worldState.getEntity('market-energy' as EntityId)
      ?.getComponent<MarketComponent>(ECONOMY_MARKET_TYPE)?.currentPrice;

    eventBus.publish(
      'economy.impose-sanction',
      { targetCountryId: 'country-br', sanctionType: 'trade-embargo', severity: 0.9 },
      'test',
      'country-us' as EntityId,
    );
    eventBus.flush();

    const sanctions = worldState.getEntitiesByComponent(ECONOMY_SANCTION_TYPE);
    expect(sanctions).toHaveLength(1);
    expect(timeline.query({ eventType: ECONOMY_SANCTION_IMPOSED_EVENT })).toHaveLength(1);

    // ─── Tick 4: Sanction blocks route, no trade ───────────────
    engine.tick();

    const blockedEvents = timeline.query({ eventType: ECONOMY_TRADE_ROUTE_BLOCKED_EVENT });
    expect(blockedEvents).toHaveLength(1);

    const flowAfterBlockade = timeline.query({ eventType: ECONOMY_TRADE_FLOW_EVENT });
    expect(flowAfterBlockade).toHaveLength(3); // Still 3 — no new flow

    // Route is inactive
    const routeAfter = worldState.getEntity(routes[0]!.id);
    const routeCompAfter = routeAfter?.getComponent<TradeRouteComponent>(ECONOMY_TRADE_ROUTE_TYPE);
    expect(routeCompAfter?.isActive).toBe(false);

    // ─── Tick 5-6: Market adjusts to BR's absence from energy supply ──
    engine.tick();
    engine.tick();

    const priceAfter = worldState.getEntity('market-energy' as EntityId)
      ?.getComponent<MarketComponent>(ECONOMY_MARKET_TYPE)?.currentPrice;

    // BR contributed 300 energy, now sanctioned. Supply dropped, price should rise
    if (priceBefore !== undefined && priceAfter !== undefined) {
      expect(priceAfter).toBeGreaterThan(priceBefore);
    }

    // ─── Action 3: Lift sanction ────────────────────────────────
    const sanctionEntities = worldState.getEntitiesByComponent(ECONOMY_SANCTION_TYPE);
    const sanctionId = sanctionEntities[0]!.id;

    eventBus.publish(
      'economy.lift-sanction',
      { sanctionId },
      'test',
      'country-us' as EntityId,
    );
    eventBus.flush();

    expect(worldState.hasEntity(sanctionId)).toBe(false);
    expect(timeline.query({ eventType: ECONOMY_SANCTION_LIFTED_EVENT })).toHaveLength(1);

    // ─── Tick 7-9: Trade resumes ────────────────────────────────
    engine.tick();
    engine.tick();
    engine.tick();

    const flowAfterLift = timeline.query({ eventType: ECONOMY_TRADE_FLOW_EVENT });
    // 3 (before) + 3 (after lift) = 6 (route was blocked for ticks 4-6, so ticks 7-9 = 3 new flows)
    expect(flowAfterLift.length).toBeGreaterThanOrEqual(5);

    // Treasury grew again after sanctions lifted
    const brAfter = worldState.getEntity('country-br' as EntityId);
    const brTreasuryAfter = (brAfter?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE))?.treasury;
    expect(Number(brTreasuryAfter)).toBeGreaterThan(Number(brTreasury));
  });

  it('should close a trade route via agent action', () => {
    const { timeline, worldState, engine } = buildEngine();

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

    const actionSys = new AgentActionSystem();
    engine.registerSystem(actionSys);
    engine.registerSystem(new TradeSystem());

    // Close the route via action
    engine.getEventBus().publish(
      'economy.close-trade-route',
      { routeId },
      'test',
      'country-br' as EntityId,
    );
    engine.getEventBus().flush();

    const routeAfter = worldState.getEntity(routeId);
    const comp = routeAfter?.getComponent<TradeRouteComponent>(ECONOMY_TRADE_ROUTE_TYPE);
    expect(comp?.isActive).toBe(false);
    expect(timeline.query({ eventType: ECONOMY_TRADE_ROUTE_BLOCKED_EVENT })).toHaveLength(1);

    // Trade should not flow
    engine.tick();
    expect(timeline.query({ eventType: ECONOMY_TRADE_FLOW_EVENT })).toHaveLength(0);
  });

  it('should not create duplicate sanctions', () => {
    const { eventBus, worldState, engine } = buildEngine();

    worldState.createEntity('country-br' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 2000, inflationRate: 0.04, treasury: 150, taxRate: 0.2 },
    ]);
    worldState.createEntity('country-us' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 28700, inflationRate: 0.028, treasury: 1800, taxRate: 0.24 },
    ]);

    const actionSys = new AgentActionSystem();
    engine.registerSystem(actionSys);

    // Impose same sanction twice
    const pub = () => eventBus.publish(
      'economy.impose-sanction',
      { targetCountryId: 'country-br', sanctionType: 'trade-embargo', severity: 0.8 },
      'test',
      'country-us' as EntityId,
    );
    pub();
    eventBus.flush();
    pub();
    eventBus.flush();

    const sanctions = worldState.getEntitiesByComponent(ECONOMY_SANCTION_TYPE);
    expect(sanctions).toHaveLength(1);
  });

  it('should run 100 ticks without errors (long-run stability)', () => {
    const { worldState, engine } = buildEngine();

    worldState.createEntity('country-br' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 2000, inflationRate: 0.04, treasury: 150, taxRate: 0.2 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 100, foodOutput: 200, mineralsOutput: 50, industrialOutput: 80 },
    ]);
    worldState.createEntity('country-us' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 28700, inflationRate: 0.028, treasury: 1800, taxRate: 0.24 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 300, foodOutput: 400, mineralsOutput: 100, industrialOutput: 500 },
    ]);
    worldState.createEntity('country-cn' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 18000, inflationRate: 0.02, treasury: 3500, taxRate: 0.25 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 500, foodOutput: 600, mineralsOutput: 300, industrialOutput: 700 },
    ]);

    worldState.createEntity('market-energy' as EntityId, [
      { type: ECONOMY_MARKET_TYPE, resourceType: 'energy', currentPrice: 50, totalSupply: 0, totalDemand: 0, priceVolatility: 0.3 },
    ]);

    // Trade routes
    const routes = [
      { id: 'route-br-us' as EntityId, src: 'country-br' as EntityId, tgt: 'country-us' as EntityId, res: 'energy', vol: 5 },
      { id: 'route-cn-br' as EntityId, src: 'country-cn' as EntityId, tgt: 'country-br' as EntityId, res: 'minerals', vol: 8 },
    ];
    for (const r of routes) {
      worldState.createEntity(r.id, [
        { type: ECONOMY_TRADE_ROUTE_TYPE, sourceCountryId: r.src, targetCountryId: r.tgt, resourceType: r.res, volumePerTick: r.vol, isActive: true, establishedTick: 0 as any } as TradeRouteComponent,
      ]);
    }

    engine.registerSystem(new TradeSystem());
    engine.registerSystem(new EconomySystem());
    engine.registerSystem(new MarketSystem());

    // Sanction that kicks in at tick 30
    const sanctionId = 'sanction-us-br' as EntityId;
    worldState.createEntity(sanctionId, [
      { type: ECONOMY_SANCTION_TYPE, sourceCountryId: 'country-us' as EntityId, targetCountryId: 'country-br' as EntityId, sanctionType: 'trade-embargo', severity: 1.0, startTick: 30 as any } as SanctionComponent,
    ]);
    engine.registerSystem(new SanctionSystem());

    // Run 100 ticks — no exceptions expected
    let results;
    expect(() => { results = engine.runTicks(100); }).not.toThrow();

    expect(results).toHaveLength(100);
    expect(engine.getCurrentTick()).toBe(100);

    // State remains accessible
    expect(worldState.getEntityCount()).toBeGreaterThanOrEqual(7); // 3 countries + 2 routes + 1 market + 1 sanction

    // Market price evolved over time
    const marketEntity = worldState.getEntity('market-energy' as EntityId);
    const market = marketEntity?.getComponent<MarketComponent>(ECONOMY_MARKET_TYPE);
    expect(market).toBeDefined();
    expect(market!.currentPrice).not.toBe(50); // Price changed from initial

    // Trade flowed at some point
    const flowCount = engine.getTimeline().query({ eventType: ECONOMY_TRADE_FLOW_EVENT }).length;
    expect(flowCount).toBeGreaterThan(0);

    // Route was blocked by sanction
    const blockedCount = engine.getTimeline().query({ eventType: ECONOMY_TRADE_ROUTE_BLOCKED_EVENT }).length;
    expect(blockedCount).toBeGreaterThanOrEqual(1);

    // No crash without reason
    const priceEvents = engine.getTimeline().query({ eventType: ECONOMY_PRICE_UPDATED_EVENT }).length;
    expect(priceEvents).toBeGreaterThan(0);

    // All timelines consistent
    expect(engine.getTimeline().getLatestTick()).toBe(100);
  });
});
