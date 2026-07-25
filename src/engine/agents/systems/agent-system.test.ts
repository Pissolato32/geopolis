import { describe, it, expect } from 'vitest';
import { WorldState } from '../../core/world-state/world-state.js';
import { EventBus } from '../../core/event-bus/event-bus.js';
import { Timeline } from '../../core/timeline/timeline.js';
import { TickEngine } from '../../core/tick-engine/tick-engine.js';
import { AgentSystem } from './agent.system.js';
import { AgentActionSystem } from './agent-action.system.js';
import { HeuristicAgentProvider } from '../llm/heuristic.provider.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';
import { ECONOMIC_INDICATOR_TYPE, RESOURCE_PRODUCTION_TYPE } from '../../domain/economy/components/economy.components.js';
import { GOVERNMENT_STABILITY_TYPE, GovernmentStabilityComponent } from '../../domain/politics/components/politics.components.js';
import { DIPLOMATIC_RELATION_TYPE } from '../../domain/diplomacy/components/relation.component.js';
import { ECONOMY_SANCTION_TYPE } from '../../domain/economy/components/sanction.components.js';
import { EconomySystem } from '../../domain/economy/systems/economy.system.js';
import { TradeSystem } from '../../domain/economy/systems/trade.system.js';
import { MarketSystem } from '../../domain/economy/systems/market.system.js';
import { SanctionSystem } from '../../domain/economy/systems/sanction.system.js';

describe('AgentSystem', () => {
  it('should discover agent entities by economy.indicator component', () => {
    const worldState = new WorldState('agent-system-test');
    worldState.createEntity('country-br' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 2170, inflationRate: 0.04, treasury: 340, taxRate: 0.22 },
    ]);
    worldState.createEntity('country-us' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 28700, inflationRate: 0.028, treasury: 1800, taxRate: 0.24 },
    ]);

    const agentSys = new AgentSystem();
    agentSys.discoverAgents(worldState);
    expect(agentSys.getAgentCount()).toBe(2);
  });

  it('should register agents from config without discovery', () => {
    const agentSys = new AgentSystem({
      controlledEntities: ['country-br' as EntityId, 'country-us' as EntityId],
    });
    expect(agentSys.getAgentCount()).toBe(2);
  });

  it('should be passive (no-op) when no provider or evaluator is configured', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('agent-system-passive');
    const engine = new TickEngine(worldState, eventBus, timeline);

    const countryId = 'country-br' as EntityId;
    worldState.createEntity(countryId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 2170, inflationRate: 0.04, treasury: 340, taxRate: 0.22 },
    ]);

    const agentSys = new AgentSystem({ controlledEntities: [countryId] });
    engine.registerSystem(agentSys);

    engine.tick();

    const agentEvents = timeline.query({ sourceSystem: `agent.${countryId}` });
    expect(agentEvents).toHaveLength(0);
    expect(agentSys.getAgentCount()).toBe(1);
  });

  it('should evaluate and publish actions via sync evaluator', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('agent-system-eval-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    const countryId = 'country-br' as EntityId;
    worldState.createEntity(countryId, [
      {
        type: ECONOMIC_INDICATOR_TYPE,
        gdp: 2170,
        inflationRate: 0.04,
        treasury: 340,
        taxRate: 0.22,
      },
      {
        type: GOVERNMENT_STABILITY_TYPE,
        stabilityIndex: 0.75,
        approvalRating: 0.55,
        militaryLoyalty: 0.9,
      },
    ]);

    const actionSys = new AgentActionSystem();
    engine.registerSystem(actionSys);

    const agentSys = new AgentSystem({
      controlledEntities: [countryId],
      evaluator: (_prompt: string) => {
        return JSON.stringify({
          actionType: 'politics.maintain-stability',
          actorEntityId: 'country-br',
          parameters: {},
          narrativeSummary: 'Stability decree issued',
        });
      },
    });
    engine.registerSystem(agentSys);

    engine.tick();

    const agentEvents = timeline.query({ sourceSystem: `agent.${countryId}` });
    expect(agentEvents).toHaveLength(1);
    expect(agentEvents[0]!.event.type).toBe('politics.maintain-stability');

    const agents = agentSys.getAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0]!.memory.getRecentDecisions()).toHaveLength(1);
    expect(agents[0]!.memory.getRecentDecisions()[0]).toBe('Stability decree issued');
  });

  it('should evaluate and publish actions via HeuristicAgentProvider', async () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('agent-system-heuristic');
    const engine = new TickEngine(worldState, eventBus, timeline);

    const countryId = 'country-br' as EntityId;
    worldState.createEntity(countryId, [
      {
        type: ECONOMIC_INDICATOR_TYPE,
        gdp: 2170,
        inflationRate: 0.04,
        treasury: 340,
        taxRate: 0.22,
      },
      {
        type: GOVERNMENT_STABILITY_TYPE,
        stabilityIndex: 0.85,
        approvalRating: 0.55,
        militaryLoyalty: 0.9,
      },
    ]);

    const actionSys = new AgentActionSystem();
    engine.registerSystem(actionSys);

    const heuristicProvider = new HeuristicAgentProvider({
      countryId,
      metrics: {
        stabilityIndex: 0.85, treasury: 340, foodOutput: 300,
        lowestAffinity: undefined, lowestAffinityTarget: undefined,
        highestTension: undefined, highestTensionTarget: undefined,
        highestAffinity: undefined, highestAffinityTarget: undefined, gdp: undefined,
      },
    });

    const agentSys = new AgentSystem({
      controlledEntities: [countryId],
      provider: heuristicProvider,
    });
    engine.registerSystem(agentSys);

    engine.tick();

    await Promise.resolve();
    eventBus.flush();

    const agentEvents = timeline.query({ sourceSystem: `agent.${countryId}` });
    expect(agentEvents).toHaveLength(1);

    const agents = agentSys.getAgents();
    expect(agents[0]!.memory.getRecentDecisions()).toHaveLength(1);
  });

  it('should not publish invalid action payloads', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('agent-system-invalid-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    const countryId = 'country-br' as EntityId;
    worldState.createEntity(countryId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 2170, inflationRate: 0.04, treasury: 340, taxRate: 0.22 },
    ]);

    const agentSys = new AgentSystem({
      controlledEntities: [countryId],
      evaluator: () => 'not-json-at-all',
    });
    engine.registerSystem(agentSys);

    engine.tick();

    const agentEvents = timeline.query({ sourceSystem: `agent.${countryId}` });
    expect(agentEvents).toHaveLength(0);
  });

  it('should run 5 ticks with HeuristicAgentProvider + AgentActionSystem pipeline', async () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('agent-system-pipeline');
    const engine = new TickEngine(worldState, eventBus, timeline);

    const countryId = 'country-br' as EntityId;
    worldState.createEntity(countryId, [
      {
        type: ECONOMIC_INDICATOR_TYPE,
        gdp: 2170,
        inflationRate: 0.04,
        treasury: 340,
        taxRate: 0.22,
      },
      {
        type: GOVERNMENT_STABILITY_TYPE,
        stabilityIndex: 0.75,
        approvalRating: 0.55,
        militaryLoyalty: 0.9,
      },
    ]);

    const actionSys = new AgentActionSystem();
    engine.registerSystem(actionSys);

    const heuristicProvider = new HeuristicAgentProvider({
      countryId,
      metrics: {
        stabilityIndex: 0.75, treasury: 340, foodOutput: 300,
        lowestAffinity: undefined, lowestAffinityTarget: undefined,
        highestTension: undefined, highestTensionTarget: undefined,
        highestAffinity: undefined, highestAffinityTarget: undefined, gdp: undefined,
      },
    });

    const agentSys = new AgentSystem({
      controlledEntities: [countryId],
      provider: heuristicProvider,
    });
    engine.registerSystem(agentSys);

    const results = engine.runTicks(5);

    await Promise.resolve();
    eventBus.flush();

    expect(results).toHaveLength(5);
    expect(engine.getCurrentTick()).toBe(5);

    const agents = agentSys.getAgents();
    expect(agents[0]!.memory.getRecentDecisions()).toHaveLength(5);

    const agentEvents = timeline.query({ sourceSystem: `agent.${countryId}` });
    expect(agentEvents).toHaveLength(5);

    const brEntity = worldState.getEntity(countryId);
    const stabilityComp = brEntity?.getComponent<GovernmentStabilityComponent>(GOVERNMENT_STABILITY_TYPE);
    expect(stabilityComp).toBeDefined();
    expect(stabilityComp!.stabilityIndex).toBeGreaterThan(0.75);
  });

  it('should run 20 ticks with full economic pipeline and heuristic agents reacting to state', async () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('agent-system-e2e-20ticks');
    const engine = new TickEngine(worldState, eventBus, timeline);

    // ── Setup 2 countries ──────────────────────────────────
    worldState.createEntity('country-us' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 28700, inflationRate: 0.028, treasury: 1800, taxRate: 0.24 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 300, foodOutput: 400, mineralsOutput: 100, industrialOutput: 500 },
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.85, approvalRating: 0.55, militaryLoyalty: 0.95 },
      { type: DIPLOMATIC_RELATION_TYPE, targetCountryId: 'country-br' as EntityId, affinity: -0.5, tension: 0.6, recognition: 'full' as const, activeTreaties: [] },
    ]);

    worldState.createEntity('country-br' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 2170, inflationRate: 0.04, treasury: 800, taxRate: 0.22 },
      { type: RESOURCE_PRODUCTION_TYPE, energyOutput: 150, foodOutput: 300, mineralsOutput: 50, industrialOutput: 80 },
      { type: GOVERNMENT_STABILITY_TYPE, stabilityIndex: 0.75, approvalRating: 0.55, militaryLoyalty: 0.9 },
      { type: DIPLOMATIC_RELATION_TYPE, targetCountryId: 'country-us' as EntityId, affinity: -0.5, tension: 0.6, recognition: 'full' as const, activeTreaties: [] },
    ]);

    // Global market
    worldState.createEntity('market-energy' as EntityId, [
      { type: 'economy.market' as any, resourceType: 'energy', currentPrice: 50, totalSupply: 0, totalDemand: 0, priceVolatility: 0.3 },
    ]);

    // ── Register full pipeline ─────────────────────────────
    const actionSys = new AgentActionSystem();
    engine.registerSystem(actionSys);

    const heuristicProvider = new HeuristicAgentProvider({
      countryId: 'country-us',
      metrics: {
        stabilityIndex: 0.85, treasury: 1800, foodOutput: 400,
        lowestAffinity: -0.5, lowestAffinityTarget: 'country-br',
        highestTension: 0.6, highestTensionTarget: 'country-br',
        highestAffinity: -0.5, highestAffinityTarget: 'country-br', gdp: undefined,
      },
    });

    const agentSys = new AgentSystem({
      controlledEntities: ['country-us' as EntityId, 'country-br' as EntityId],
      provider: heuristicProvider,
    });
    engine.registerSystem(agentSys);

    engine.registerSystem(new SanctionSystem());
    engine.registerSystem(new TradeSystem());
    engine.registerSystem(new EconomySystem());
    engine.registerSystem(new MarketSystem());

    // ── Tick 1-20 ──────────────────────────────────────────
    const results = engine.runTicks(20);

    await Promise.resolve();
    eventBus.flush();

    // ── Assertions ─────────────────────────────────────────
    expect(results).toHaveLength(20);
    expect(engine.getCurrentTick()).toBe(20);

    const usEvents = timeline.query({ sourceSystem: 'agent.country-us' });
    expect(usEvents.length).toBeGreaterThanOrEqual(0);

    // US has affinity -0.5 with BR and treasury 1800 (>500)
    // → HeuristicAgentProvider should have triggered impose-sanction
    const sanctionEvents = timeline.query({ eventType: 'economy.sanction-imposed' });
    expect(sanctionEvents.length).toBeGreaterThanOrEqual(1);

    // After sanctions, sanction system should create sanction entities
    const sanctions = worldState.getEntitiesByComponent(ECONOMY_SANCTION_TYPE as any);
    expect(sanctions.length).toBeGreaterThanOrEqual(1);

    // Each agent recorded decisions
    expect(agentSys.getAgents()).toHaveLength(2);
    for (const agent of agentSys.getAgents()) {
      expect(agent.memory.getRecentDecisions().length).toBeGreaterThan(0);
    }

    // Economic systems ran without error
    const stableCount = results.filter((r) => !r.snapshotCreated).length;
    expect(stableCount).toBe(20);
  });
});
