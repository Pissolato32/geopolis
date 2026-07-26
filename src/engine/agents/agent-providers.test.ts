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
import { MockProvider } from './llm/mock.provider.js';
import { OpenAiProvider } from './llm/openai.provider.js';
import { OllamaProvider } from './llm/ollama.provider.js';
import { ILlmProvider } from './llm/llm-provider.interface.js';
import { ProviderFallbackChain } from './llm/provider-chain.js';
import { InMemoryAgentMemoryStore } from './memory/in-memory-memory-store.js';
import {
  ECONOMIC_INDICATOR_TYPE,
} from '../domain/economy/components/economy.components.js';
import {
  GOVERNMENT_STABILITY_TYPE,
} from '../domain/politics/components/politics.components.js';
import {
  DIPLOMATIC_RELATION_TYPE,
} from '../domain/diplomacy/components/relation.component.js';

function buildWorld(): WorldState {
  const ws = new WorldState('provider-test');
  const ids = ['country-a', 'country-b'] as EntityId[];
  for (const id of ids) {
    const rival = ids.find((x) => x !== id)!;
    ws.createEntity(id, [
      {
        type: ECONOMIC_INDICATOR_TYPE,
        gdp: BigInt(1000), treasury: BigInt(300),
        taxRate: 0.2, inflationRate: 0.02, unemploymentRate: 0.05,
        foodOutput: 200, resourceOutput: 150, stabilityIndex: 0.7,
        tradeBalance: 0, consumerConfidence: 0.6,
      } as unknown as IComponent,
      {
        type: GOVERNMENT_STABILITY_TYPE,
        stabilityIndex: 0.75, governmentType: 'republic' as const,
        approvalRating: 0.5, factionalPower: [], legislativeSupport: 0.5,
      } as unknown as IComponent,
      {
        type: DIPLOMATIC_RELATION_TYPE,
        sourceCountryId: id, targetCountryId: rival,
        affinity: -0.3, tension: 0.6, recognition: 'full' as const,
        activeTreaties: [],
      } as unknown as IComponent,
    ]);
  }
  return ws;
}

function runWithProvider(provider: ILlmProvider): { engine: TickEngine; agentSystem: AgentSystem; eventBus: EventBus } {
  const timeline = new Timeline();
  const eventBus = new EventBus(timeline);
  const worldState = buildWorld();
  const memoryStore = new InMemoryAgentMemoryStore();

  const agentSystem = new AgentSystem({
    provider,
    defaultIntelLevel: 0.7,
    memoryStore,
  });
  const actionSystem = new AgentActionSystem();

  const engine = new TickEngine(worldState, eventBus, timeline, { maxTicks: 10 });
  engine.registerSystem(agentSystem);
  engine.registerSystem(actionSystem);

  agentSystem.discoverAgents(worldState);

  return { engine, agentSystem, eventBus };
}

describe('AgentSystem with all AI providers', () => {
  it('should work with HeuristicAgentProvider (sync path)', () => {
    const { engine, agentSystem, eventBus } = runWithProvider(new HeuristicAgentProvider());

    engine.runTicks(5);
    eventBus.flush();

    expect(agentSystem.getAgentCount()).toBe(2);
    const agents = agentSystem.getAgents();
    const totalDecisions = agents.reduce(
      (sum, a) => sum + a.memory.getRecentDecisionRecords(50).length,
      0,
    );
    expect(totalDecisions).toBeGreaterThan(0);
  });

  it('should work with MockProvider (async path)', async () => {
    const mock = new MockProvider();
    mock.setNextResponse(JSON.stringify({
      actionType: 'economy.invest',
      actorEntityId: 'country-a',
      parameters: { amount: 100 },
      narrativeSummary: 'Invested in domestic economy',
    }));

    const { engine, agentSystem, eventBus } = runWithProvider(mock);

    engine.runTicks(3);
    eventBus.flush();
    await new Promise((r) => setTimeout(r, 50));

    expect(agentSystem.getAgentCount()).toBe(2);
  });

  it('should work with OpenAiProvider (falls back on network failure)', async () => {
    const openai = new OpenAiProvider({
      apiKey: 'test-key',
      baseUrl: 'https://invalid.test.example.com/v1',
      maxTokens: 64,
    });

    const { engine, agentSystem, eventBus } = runWithProvider(openai);

    engine.runTicks(3);
    eventBus.flush();
    await new Promise((r) => setTimeout(r, 50));

    expect(agentSystem.getAgentCount()).toBe(2);
  }, 15000);

  it('should work with OllamaProvider (falls back on network failure)', async () => {
    const ollama = new OllamaProvider({
      endpoint: 'https://invalid.test.example.com/api/generate',
      timeoutMs: 500,
    });

    const { engine, agentSystem, eventBus } = runWithProvider(ollama);

    engine.runTicks(3);
    eventBus.flush();
    await new Promise((r) => setTimeout(r, 50));

    expect(agentSystem.getAgentCount()).toBe(2);
  }, 15000);

  it('should work with ProviderFallbackChain (heuristic + mock)', async () => {
    const chain = new ProviderFallbackChain([
      { provider: new HeuristicAgentProvider(), maxRetries: 0, timeoutMs: 1000 },
      { provider: new MockProvider(), maxRetries: 0, timeoutMs: 1000 },
    ]);

    const { engine, agentSystem, eventBus } = runWithProvider(chain);

    engine.runTicks(5);
    eventBus.flush();
    await new Promise((r) => setTimeout(r, 50));

    expect(agentSystem.getAgentCount()).toBe(2);
  });

  it('should work with evaluator function (direct callback path)', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = buildWorld();
    const memoryStore = new InMemoryAgentMemoryStore();

    const agentSystem = new AgentSystem({
      evaluator: (_prompt: string, _systemPrompt?: string) => JSON.stringify({
        actionType: 'politics.maintain-stability',
        actorEntityId: 'country-a',
        parameters: { priority: 'high' },
        narrativeSummary: 'Maintained stability via evaluator',
      }),
      defaultIntelLevel: 0.7,
      memoryStore,
    });
    const actionSystem = new AgentActionSystem();

    const engine = new TickEngine(worldState, eventBus, timeline, { maxTicks: 10 });
    engine.registerSystem(agentSystem);
    engine.registerSystem(actionSystem);

    agentSystem.discoverAgents(worldState);
    engine.runTicks(3);
    eventBus.flush();

    const agents = agentSystem.getAgents();
    const totalDecisions = agents.reduce(
      (sum, a) => sum + a.memory.getRecentDecisionRecords(50).length,
      0,
    );
    expect(totalDecisions).toBeGreaterThan(0);
  });

  it('should handle provider that returns invalid JSON gracefully', async () => {
    const mock = new MockProvider();
    mock.setNextResponse('this is not valid JSON');

    const { engine, agentSystem, eventBus } = runWithProvider(mock);

    engine.runTicks(2);
    eventBus.flush();
    await new Promise((r) => setTimeout(r, 50));

    expect(agentSystem.getAgentCount()).toBe(2);
  });

  it('should handle provider that returns empty response gracefully', async () => {
    const mock = new MockProvider();
    mock.setNextResponse('');

    const { engine, agentSystem, eventBus } = runWithProvider(mock);

    engine.runTicks(2);
    eventBus.flush();
    await new Promise((r) => setTimeout(r, 50));

    expect(agentSystem.getAgentCount()).toBe(2);
  });
});
