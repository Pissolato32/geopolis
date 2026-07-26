import { describe, it, expect } from 'vitest';
import { WorldState } from '../../engine/core/world-state/world-state.js';
import { EntityId } from '../../engine/core/interfaces/entity.interface.js';
import { IComponent } from '../../engine/core/interfaces/component.interface.js';
import { GoalManager } from './goal-manager.js';
import { IAgentPersonality } from './memory/agent-memory.js';
import { ECONOMIC_INDICATOR_TYPE } from '../../engine/domain/economy/components/economy.components.js';
import { DIPLOMATIC_RELATION_TYPE } from '../../engine/domain/diplomacy/components/relation.component.js';
import { GOVERNMENT_STABILITY_TYPE } from '../../engine/domain/politics/components/politics.components.js';

const balancedPersonality: IAgentPersonality = {
  aggressiveness: 0.5,
  riskTolerance: 0.5,
  trustPropensity: 0.5,
};

describe('GoalManager', () => {
  it('should generate stability goal when stabilityIndex is low', () => {
    const worldState = new WorldState('goal-test');
    const countryId = 'country-a' as EntityId;

    worldState.createEntity(countryId, [{
      type: ECONOMIC_INDICATOR_TYPE,
      gdp: 1000n,
      treasury: 500n,
      taxRate: 0.2,
      inflationRate: 0.02,
      unemploymentRate: 0.05,
      foodOutput: 300,
      resourceOutput: 200,
      stabilityIndex: 0.4,
      tradeBalance: 0,
      consumerConfidence: 0.6,
      [Symbol('idx')]: 0,
    } as unknown as IComponent, {
      type: GOVERNMENT_STABILITY_TYPE,
      stabilityIndex: 0.4,
      governmentType: 'republic' as const,
      approvalRating: 0.5,
      factionalPower: [],
      legislativeSupport: 0.5,
      [Symbol('idx')]: 0,
    } as unknown as IComponent]);

    const gm = new GoalManager(countryId, balancedPersonality);

    gm.evaluateGoals(worldState, countryId, 5);

    const goals = gm.getActiveGoals();
    const stabilityGoal = goals.find((g) => g.description.includes('stability'));
    expect(stabilityGoal).toBeDefined();
    expect(stabilityGoal!.priority).toBe(90);
  });

  it('should generate treasury goal when treasury is low', () => {
    const worldState = new WorldState('goal-test-2');
    const countryId = 'country-b' as EntityId;

    worldState.createEntity(countryId, [{
      type: ECONOMIC_INDICATOR_TYPE,
      gdp: 1000n,
      treasury: 100n,
      taxRate: 0.2,
      inflationRate: 0.02,
      unemploymentRate: 0.05,
      foodOutput: 300,
      resourceOutput: 200,
      stabilityIndex: 0.85,
      tradeBalance: 0,
      consumerConfidence: 0.6,
    } as unknown as IComponent]);

    const gm = new GoalManager(countryId, balancedPersonality);
    gm.evaluateGoals(worldState, countryId, 5);

    const goals = gm.getActiveGoals();
    const treasuryGoal = goals.find((g) => g.description.includes('treasury'));
    expect(treasuryGoal).toBeDefined();
    expect(treasuryGoal!.priority).toBe(75);
  });

  it('should generate military readiness goal when tension is high', () => {
    const worldState = new WorldState('goal-test-3');
    const countryA = 'country-a' as EntityId;
    const countryB = 'country-b' as EntityId;

    worldState.createEntity(countryA, [{
      type: ECONOMIC_INDICATOR_TYPE,
      gdp: 1000n, treasury: 500n, taxRate: 0.2,
      inflationRate: 0.02, unemploymentRate: 0.05,
      foodOutput: 300, resourceOutput: 200,
      stabilityIndex: 0.85, tradeBalance: 0, consumerConfidence: 0.6,
    } as unknown as IComponent, {
      type: GOVERNMENT_STABILITY_TYPE,
      stabilityIndex: 0.85,
      governmentType: 'republic' as const,
      approvalRating: 0.8,
      factionalPower: [],
      legislativeSupport: 0.7,
    } as unknown as IComponent, {
      type: DIPLOMATIC_RELATION_TYPE,
      sourceCountryId: countryA, targetCountryId: countryB,
      affinity: -0.5, tension: 0.85,
      recognition: 'full' as const, activeTreaties: [],
    } as unknown as IComponent]);

    const gm = new GoalManager(countryA, balancedPersonality);
    gm.evaluateGoals(worldState, countryA, 5);

    const goals = gm.getActiveGoals();
    const milGoal = goals.find((g) => g.description.includes('readiness'));
    expect(milGoal).toBeDefined();
  });

  it('should generate trade goal when affinity is high with ally', () => {
    const worldState = new WorldState('goal-test-4');
    const countryA = 'country-a' as EntityId;
    const countryB = 'country-b' as EntityId;

    worldState.createEntity(countryA, [{
      type: ECONOMIC_INDICATOR_TYPE,
      gdp: 1000n, treasury: 500n, taxRate: 0.2,
      inflationRate: 0.02, unemploymentRate: 0.05,
      foodOutput: 300, resourceOutput: 200,
      stabilityIndex: 0.85, tradeBalance: 0, consumerConfidence: 0.6,
    } as unknown as IComponent, {
      type: GOVERNMENT_STABILITY_TYPE,
      stabilityIndex: 0.85,
      governmentType: 'republic' as const,
      approvalRating: 0.8,
      factionalPower: [],
      legislativeSupport: 0.7,
    } as unknown as IComponent, {
      type: DIPLOMATIC_RELATION_TYPE,
      sourceCountryId: countryA, targetCountryId: countryB,
      affinity: 0.7, tension: 0.1,
      recognition: 'full' as const, activeTreaties: [],
    } as unknown as IComponent]);

    const gm = new GoalManager(countryA, balancedPersonality);
    gm.evaluateGoals(worldState, countryA, 5);

    const goals = gm.getActiveGoals();
    const tradeGoal = goals.find((g) => g.description.includes('trade'));
    expect(tradeGoal).toBeDefined();
  });

  it('should mark stability goal as completed when stabilityIndex reaches 0.8+', () => {
    const worldState = new WorldState('goal-complete-test');
    const countryId = 'country-c' as EntityId;

    worldState.createEntity(countryId, [{
      type: ECONOMIC_INDICATOR_TYPE,
      gdp: 1000n, treasury: 500n, taxRate: 0.2,
      inflationRate: 0.02, unemploymentRate: 0.05,
      foodOutput: 300, resourceOutput: 200,
      stabilityIndex: 0.85, tradeBalance: 0, consumerConfidence: 0.6,
    } as unknown as IComponent, {
      type: GOVERNMENT_STABILITY_TYPE,
      stabilityIndex: 0.85,
      governmentType: 'republic' as const,
      approvalRating: 0.8,
      factionalPower: [],
      legislativeSupport: 0.7,
    } as unknown as IComponent]);

    const gm = new GoalManager(countryId, balancedPersonality);
    gm.addGoal({ goalId: 'restore-stability-test', description: 'restore stability to acceptable levels', priority: 90 }, 0);

    gm.evaluateGoals(worldState, countryId, 5);

    const goals = gm.getActiveGoals();
    expect(goals.find((g) => g.goalId === 'restore-stability-test')).toBeUndefined();
  });

  it('should prioritize goals based on personality — aggressive favors military goals', () => {
    const worldState = new WorldState('goal-priority-test');
    const countryA = 'country-a' as EntityId;
    const countryB = 'country-b' as EntityId;

    worldState.createEntity(countryA, [{
      type: ECONOMIC_INDICATOR_TYPE,
      gdp: 1000n, treasury: 100n, taxRate: 0.2,
      inflationRate: 0.02, unemploymentRate: 0.05,
      foodOutput: 300, resourceOutput: 200,
      stabilityIndex: 0.4, tradeBalance: 0, consumerConfidence: 0.6,
    } as unknown as IComponent, {
      type: GOVERNMENT_STABILITY_TYPE,
      stabilityIndex: 0.4,
      governmentType: 'republic' as const,
      approvalRating: 0.3,
      factionalPower: [],
      legislativeSupport: 0.4,
    } as unknown as IComponent, {
      type: DIPLOMATIC_RELATION_TYPE,
      sourceCountryId: countryA, targetCountryId: countryB,
      affinity: -0.5, tension: 0.85,
      recognition: 'full' as const, activeTreaties: [],
    } as unknown as IComponent]);

    const aggressive: IAgentPersonality = { aggressiveness: 0.9, riskTolerance: 0.5, trustPropensity: 0.3 };
    const pacifist: IAgentPersonality = { aggressiveness: 0.1, riskTolerance: 0.5, trustPropensity: 0.7 };

    const gmAggro = new GoalManager(countryA, aggressive);
    gmAggro.evaluateGoals(worldState, countryA, 5);
    const aggroGoals = gmAggro.getActiveGoals();

    const gmPacifist = new GoalManager(countryA, pacifist);
    gmPacifist.evaluateGoals(worldState, countryA, 5);
    const pacifistGoals = gmPacifist.getActiveGoals();

    const aggroMilIdx = aggroGoals.findIndex((g) => g.description.includes('readiness'));
    const pacifistMilIdx = pacifistGoals.findIndex((g) => g.description.includes('readiness'));

    expect(aggroMilIdx).toBeGreaterThanOrEqual(0);
    expect(aggroMilIdx).toBeLessThan(pacifistMilIdx >= 0 ? pacifistMilIdx : aggroGoals.length);
  });

  it('should throttle evaluation to every 5 ticks', () => {
    const worldState = new WorldState('goal-throttle-test');
    const countryId = 'country-d' as EntityId;

    worldState.createEntity(countryId, [{
      type: ECONOMIC_INDICATOR_TYPE,
      gdp: 1000n, treasury: 500n, taxRate: 0.2,
      inflationRate: 0.02, unemploymentRate: 0.05,
      foodOutput: 300, resourceOutput: 200,
      stabilityIndex: 0.4, tradeBalance: 0, consumerConfidence: 0.6,
    } as unknown as IComponent, {
      type: GOVERNMENT_STABILITY_TYPE,
      stabilityIndex: 0.4,
      governmentType: 'republic' as const,
      approvalRating: 0.3,
      factionalPower: [],
      legislativeSupport: 0.4,
    } as unknown as IComponent]);

    const gm = new GoalManager(countryId, balancedPersonality);
    gm.evaluateGoals(worldState, countryId, 5);
    const goalsAtTick0 = gm.getActiveGoals().length;

    gm.evaluateGoals(worldState, countryId, 3);
    const goalsAtTick3 = gm.getActiveGoals().length;

    expect(goalsAtTick0).toBeGreaterThan(0);
    expect(goalsAtTick3).toBe(goalsAtTick0);
  });
});
