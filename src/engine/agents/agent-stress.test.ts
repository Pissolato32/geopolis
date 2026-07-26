import { describe, it, expect } from 'vitest';
import { WorldState } from '../core/world-state/world-state.js';
import { EventBus } from '../core/event-bus/event-bus.js';
import { Timeline } from '../core/timeline/timeline.js';
import { TickEngine } from '../core/tick-engine/tick-engine.js';
import { EntityId } from '../core/interfaces/entity.interface.js';
import { IComponent } from '../core/interfaces/component.interface.js';
import { AgentSystem } from './systems/agent.system.js';
import { AgentActionSystem } from './systems/agent-action.system.js';
import { HeuristicAgentProvider } from './llm/heuristic.provider.js';
import { EconomySystem } from '../domain/economy/systems/economy.system.js';
import { PoliticsSystem } from '../domain/politics/systems/politics.system.js';
import { DiplomacySystem } from '../domain/diplomacy/systems/diplomacy.system.js';
import {
  ECONOMIC_INDICATOR_TYPE,
} from '../domain/economy/components/economy.components.js';
import {
  GOVERNMENT_STABILITY_TYPE,
} from '../domain/politics/components/politics.components.js';
import {
  DIPLOMATIC_RELATION_TYPE,
} from '../domain/diplomacy/components/relation.component.js';

function buildStressWorld(countryCount: number): WorldState {
  const ws = new WorldState('stress-test');
  for (let i = 0; i < countryCount; i++) {
    const id = `country-${i}` as EntityId;
    const allyId = `country-${(i + 1) % countryCount}` as EntityId;
    const rivalId = `country-${(i + 2) % countryCount}` as EntityId;

    ws.createEntity(id, [
      {
        type: ECONOMIC_INDICATOR_TYPE,
        gdp: BigInt(1000 + i * 100),
        treasury: BigInt(300 + i * 50),
        taxRate: 0.2,
        inflationRate: 0.02,
        unemploymentRate: 0.05,
        foodOutput: 200 + i * 10,
        resourceOutput: 150 + i * 5,
        stabilityIndex: 0.7,
        tradeBalance: 0,
        consumerConfidence: 0.6,
      } as unknown as IComponent,
      {
        type: GOVERNMENT_STABILITY_TYPE,
        stabilityIndex: i % 3 === 0 ? 0.45 : 0.8,
        governmentType: 'republic' as const,
        approvalRating: 0.5,
        factionalPower: [],
        legislativeSupport: 0.5,
      } as unknown as IComponent,
      {
        type: DIPLOMATIC_RELATION_TYPE,
        sourceCountryId: id,
        targetCountryId: rivalId,
        affinity: -0.4,
        tension: 0.75,
        recognition: 'full' as const,
        activeTreaties: [],
      } as unknown as IComponent,
      {
        type: DIPLOMATIC_RELATION_TYPE,
        sourceCountryId: id,
        targetCountryId: allyId,
        affinity: 0.6,
        tension: 0.1,
        recognition: 'full' as const,
        activeTreaties: [],
      } as unknown as IComponent,
    ]);
  }
  return ws;
}

describe('Agent Stress Test (10 agents, 100 ticks)', () => {
  it('should run 10 agents for 100 ticks without errors', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = buildStressWorld(10);
    const provider = new HeuristicAgentProvider();

    const agentSystem = new AgentSystem({
      provider,
      defaultIntelLevel: 0.7,
    });
    const actionSystem = new AgentActionSystem();
    const economySystem = new EconomySystem();
    const politicsSystem = new PoliticsSystem();
    const diplomacySystem = new DiplomacySystem();

    const engine = new TickEngine(worldState, eventBus, timeline, { maxTicks: 100 });
    engine.registerSystem(economySystem);
    engine.registerSystem(politicsSystem);
    engine.registerSystem(diplomacySystem);
    engine.registerSystem(agentSystem);
    engine.registerSystem(actionSystem);

    agentSystem.discoverAgents(worldState);
    expect(agentSystem.getAgentCount()).toBe(10);

    const results = engine.runTicks(100);

    expect(results.length).toBe(100);
    for (const r of results) {
      expect(r.systemsExecuted).toBe(5);
    }
  });

  it('should emit agent actions during the simulation', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = buildStressWorld(10);
    const provider = new HeuristicAgentProvider();

    const agentSystem = new AgentSystem({ provider, defaultIntelLevel: 0.7 });
    const actionSystem = new AgentActionSystem();

    const engine = new TickEngine(worldState, eventBus, timeline);
    engine.registerSystem(agentSystem);
    engine.registerSystem(actionSystem);

    agentSystem.discoverAgents(worldState);

    const publishedEvents: string[] = [];
    eventBus.subscribe('*', (event) => {
      publishedEvents.push(event.type);
    });

    engine.runTicks(20);
    eventBus.flush();

    const agentActions = publishedEvents.filter((t) =>
      t.startsWith('economy.') ||
      t.startsWith('politics.') ||
      t.startsWith('military.') ||
      t.startsWith('diplomacy.'),
    );

    expect(agentActions.length).toBeGreaterThan(0);
  });

  it('should not degrade performance below 50 ticks/sec with 10 agents', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = buildStressWorld(10);
    const provider = new HeuristicAgentProvider();

    const agentSystem = new AgentSystem({ provider, defaultIntelLevel: 0.7 });
    const actionSystem = new AgentActionSystem();

    const engine = new TickEngine(worldState, eventBus, timeline);
    engine.registerSystem(agentSystem);
    engine.registerSystem(actionSystem);

    agentSystem.discoverAgents(worldState);

    const start = performance.now();
    engine.runTicks(100);
    eventBus.flush();
    const elapsed = performance.now() - start;

    const ticksPerSecond = 100 / (elapsed / 1000);
    expect(ticksPerSecond).toBeGreaterThan(50);
  });

  it('should record decisions in agent memory', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = buildStressWorld(5);
    const provider = new HeuristicAgentProvider();

    const agentSystem = new AgentSystem({ provider, defaultIntelLevel: 0.7 });
    const actionSystem = new AgentActionSystem();

    const engine = new TickEngine(worldState, eventBus, timeline);
    engine.registerSystem(agentSystem);
    engine.registerSystem(actionSystem);

    agentSystem.discoverAgents(worldState);
    engine.runTicks(10);
    eventBus.flush();

    const agents = agentSystem.getAgents();
    const totalDecisions = agents.reduce(
      (sum, a) => sum + a.memory.getRecentDecisionRecords(50).length,
      0,
    );
    expect(totalDecisions).toBeGreaterThan(0);
  });

  it('should handle 20 agents without crash', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = buildStressWorld(20);
    const provider = new HeuristicAgentProvider();

    const agentSystem = new AgentSystem({ provider, defaultIntelLevel: 0.7 });
    const actionSystem = new AgentActionSystem();

    const engine = new TickEngine(worldState, eventBus, timeline);
    engine.registerSystem(agentSystem);
    engine.registerSystem(actionSystem);

    agentSystem.discoverAgents(worldState);
    expect(agentSystem.getAgentCount()).toBe(20);

    const results = engine.runTicks(50);
    expect(results.length).toBe(50);
  });
});
