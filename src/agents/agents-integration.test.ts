import { describe, it, expect } from 'vitest';
import { WorldState } from '../core/world-state/world-state.js';
import { EventBus } from '../core/event-bus/event-bus.js';
import { Timeline } from '../core/timeline/timeline.js';
import { TickEngine } from '../core/tick-engine/tick-engine.js';
import { AgentController } from './controller/agent-controller.js';
import { EntityId } from '../core/interfaces/entity.interface.js';
import { IComponent } from '../core/interfaces/component.interface.js';
import { ECONOMIC_INDICATOR_TYPE } from '../domain/economy/components/economy.components.js';
import { GOVERNMENT_STABILITY_TYPE } from '../domain/politics/components/politics.components.js';

describe('Phase 3: AI Agents & Fog of War End-to-End Integration', () => {
  it('should execute 5 ticks of agent decision evaluations under Fog of War', async () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('agents-integration-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    // 1. Setup country entities
    const countryId = 'country-br' as EntityId;
    worldState.createEntity(countryId, [
      {
        type: ECONOMIC_INDICATOR_TYPE,
        gdp: 2170n,
        inflationRate: 0.04,
        treasury: 340n,
        taxRate: 0.22,
      } as unknown as IComponent,
      {
        type: GOVERNMENT_STABILITY_TYPE,
        stabilityIndex: 0.75,
        approvalRating: 0.55,
        militaryLoyalty: 0.9,
      } as unknown as IComponent,
    ]);

    // 2. Instantiate Agent Controller with mock LLM evaluator returning structured JSON actions
    const agent = new AgentController({
      countryId,
      personality: { aggressiveness: 0.6, riskTolerance: 0.5 },
      llmEvaluator: async (prompt) => {
        expect(prompt).toContain('country-br');
        expect(prompt).toContain('PERCEIVED WORLD STATE');
        return `\`\`\`json
{
  "actionType": "politics.maintain-stability",
  "actorEntityId": "country-br",
  "parameters": { "budgetAllocated": 50 },
  "narrativeSummary": "Issued stability decree"
}
\`\`\``;
      },
    });

    // 3. Run 5 ticks with agent decision evaluation
    for (let i = 0; i < 5; i++) {
      engine.tick();
      await agent.evaluateTick(worldState, eventBus);
    }
    eventBus.flush();

    // ─── Assertions ─────────────────────────────────────────

    expect(engine.getCurrentTick()).toBe(5);

    // Verify agent memory recorded 5 decisions
    expect(agent.memory.getRecentDecisions()).toHaveLength(5);
    expect(agent.memory.getRecentDecisions()[0]).toBe('Issued stability decree');

    // Verify events were emitted by agent and logged in Timeline
    const agentEvents = timeline.query({ sourceSystem: `agent.${countryId}` });
    expect(agentEvents).toHaveLength(5);
    expect(agentEvents[0]!.event.type).toBe('politics.maintain-stability');
  });
});
