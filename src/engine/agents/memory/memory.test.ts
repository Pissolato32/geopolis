import { describe, it, expect } from 'vitest';
import { AgentMemory } from './agent-memory.js';
import { Timeline } from '../../core/timeline/timeline.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';
import { EventId, TickNumber } from '../../core/interfaces/event-bus.interface.js';

describe('AgentMemory', () => {
  it('should store personality traits and goals', () => {
    const memory = new AgentMemory('country-us' as EntityId, {
      aggressiveness: 0.8,
      riskTolerance: 0.7,
    });

    memory.addGoal({
      goalId: 'goal-1',
      description: 'Expand sphere of influence',
      priority: 1,
    });

    expect(memory.personality.aggressiveness).toBe(0.8);
    expect(memory.getActiveGoals()).toHaveLength(1);
  });

  it('should maintain short-term decision history capped at 10', () => {
    const memory = new AgentMemory('country-br' as EntityId);

    for (let i = 1; i <= 15; i++) {
      memory.recordDecision(`Decision ${i}`);
    }

    const recent = memory.getRecentDecisions();
    expect(recent).toHaveLength(10);
    expect(recent[0]).toBe('Decision 6');
    expect(recent[9]).toBe('Decision 15');
  });

  it('should query Timeline events for country entity', () => {
    const timeline = new Timeline();
    const countryId = 'country-br' as EntityId;

    timeline.record({
      id: 'evt-1' as EventId,
      type: 'diplomacy.tension-changed',
      tick: 1 as TickNumber,
      sourceSystem: 'diplomacy',
      entityId: countryId,
      timestamp: new Date().toISOString(),
    });

    const memory = new AgentMemory(countryId);
    const history = memory.queryRelevantHistory(timeline);

    expect(history).toHaveLength(1);
    expect(history[0]!.event.entityId).toBe(countryId);
  });
});
