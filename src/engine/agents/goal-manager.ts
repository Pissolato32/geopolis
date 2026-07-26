import { IAgentStrategicGoal, IAgentPersonality } from './memory/agent-memory.js';
import { IWorldState } from '../core/interfaces/world-state.interface.js';
import { EntityId } from '../core/interfaces/entity.interface.js';
import {
  ECONOMIC_INDICATOR_TYPE,
  EconomicIndicatorComponent,
} from '../domain/economy/components/economy.components.js';
import {
  GOVERNMENT_STABILITY_TYPE,
  GovernmentStabilityComponent,
} from '../domain/politics/components/politics.components.js';
import {
  DIPLOMATIC_RELATION_TYPE,
  RelationComponent,
} from '../domain/diplomacy/components/relation.component.js';

export type GoalStatus = 'active' | 'completed' | 'abandoned';

export interface IManagedGoal extends IAgentStrategicGoal {
  readonly status: GoalStatus;
  readonly createdAtTick: number;
  readonly subGoals?: IManagedGoal[];
}

export interface IGoalEvaluator {
  (state: Readonly<IWorldState>, countryId: EntityId): IAgentStrategicGoal[];
}

export interface IGoalPrioritizer {
  (goals: IManagedGoal[], personality: IAgentPersonality): IManagedGoal[];
}

/**
 * GoalManager — multi-turn strategic goal system for autonomous agents.
 * Creates, prioritizes, evaluates, and decomposes goals based on world state
 * and personality traits (aggressiveness, riskTolerance, trustPropensity).
 */
export class GoalManager {
  private readonly goals: Map<string, IManagedGoal> = new Map();
  private readonly personality: IAgentPersonality;
  private readonly prioritizer: IGoalPrioritizer;
  private readonly evaluator: IGoalEvaluator;
  private lastEvaluationTick: number = -1;

  constructor(
    _countryId: EntityId,
    personality: IAgentPersonality,
    evaluator?: IGoalEvaluator,
    prioritizer?: IGoalPrioritizer,
  ) {
    this.personality = personality;
    this.evaluator = evaluator ?? GoalManager.defaultEvaluator;
    this.prioritizer = prioritizer ?? GoalManager.defaultPrioritizer;
  }

  /** Add a new strategic goal. */
  addGoal(goal: IAgentStrategicGoal, currentTick: number): void {
    if (this.goals.has(goal.goalId)) return;
    this.goals.set(goal.goalId, { ...goal, status: 'active', createdAtTick: currentTick });
  }

  /** Get all active goals sorted by personality-weighted priority. */
  getActiveGoals(): ReadonlyArray<IManagedGoal> {
    const active = Array.from(this.goals.values()).filter((g) => g.status === 'active');
    return this.prioritizer(active, this.personality);
  }

  /** Evaluate goals against current world state. Called every N ticks. */
  evaluateGoals(state: Readonly<IWorldState>, countryId: EntityId, currentTick: number): void {
    const tickInterval = 5;
    if (currentTick - this.lastEvaluationTick < tickInterval) return;
    this.lastEvaluationTick = currentTick;

    this.checkCompletions(state, countryId, currentTick);

    const newGoals = this.evaluator(state, countryId);
    for (const g of newGoals) {
      if (!this.goals.has(g.goalId)) {
        this.goals.set(g.goalId, { ...g, status: 'active', createdAtTick: currentTick });
      }
    }
  }

  private checkCompletions(state: Readonly<IWorldState>, countryId: EntityId, _currentTick: number): void {
    const entity = state.getEntity(countryId);
    if (!entity) return;

    const indicator = entity.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
    const stability = entity.getComponent<GovernmentStabilityComponent>(GOVERNMENT_STABILITY_TYPE);

    for (const [id, goal] of this.goals) {
      if (goal.status !== 'active') continue;

      if (goal.description.includes('stability') && stability) {
        if (stability.stabilityIndex >= 0.8) {
          this.goals.set(id, { ...goal, status: 'completed' });
        }
      }
      if (goal.description.includes('treasury') && indicator) {
        const treasury = typeof indicator.treasury === 'bigint' ? Number(indicator.treasury) : indicator.treasury;
        if (treasury >= 1000) {
          this.goals.set(id, { ...goal, status: 'completed' });
        }
      }
      if (goal.description.includes('trade') && goal.targetCountryId) {
        const routes = state.getEntitiesByComponent('economy.trade-route');
        const hasRoute = routes.some((r) => {
          const comp = r.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
          return comp && (comp.sourceCountryId === countryId || comp.targetCountryId === countryId);
        });
        if (hasRoute) {
          this.goals.set(id, { ...goal, status: 'completed' });
        }
      }
    }
  }

  /** Default goal evaluator — generates goals based on country's situation. */
  private static defaultEvaluator: IGoalEvaluator = (state, countryId) => {
    const goals: IAgentStrategicGoal[] = [];
    const entity = state.getEntity(countryId);
    if (!entity) return goals;

    const indicator = entity.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
    const stability = entity.getComponent<GovernmentStabilityComponent>(GOVERNMENT_STABILITY_TYPE);
    const relations = state.getEntitiesByComponent(DIPLOMATIC_RELATION_TYPE);

    if (stability && stability.stabilityIndex < 0.6) {
      goals.push({
        goalId: `restore-stability-${countryId}`,
        description: 'Restore internal government stability to safe levels',
        priority: 90,
      });
    }

    if (indicator) {
      const treasury = typeof indicator.treasury === 'bigint' ? Number(indicator.treasury) : indicator.treasury;
      if (treasury < 200) {
        goals.push({
          goalId: `boost-treasury-${countryId}`,
          description: 'Boost treasury reserves through economic investment',
          priority: 75,
        });
      }
    }

    const enemyRelations = relations.filter((r) => {
      const comp = r.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
      return comp && (comp.sourceCountryId === countryId || comp.targetCountryId === countryId) && comp.tension > 0.7;
    });
    if (enemyRelations.length > 0) {
      const target = enemyRelations[0]!.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
      const enemyId = target?.sourceCountryId === countryId ? target.targetCountryId : target?.sourceCountryId;
      if (enemyId) {
        goals.push({
          goalId: `military-readiness-${countryId}-${enemyId}`,
          description: `Increase military readiness against threat ${enemyId}`,
          targetCountryId: enemyId as EntityId,
          priority: 70,
        });
      }
    }

    const allyRelations = relations.filter((r) => {
      const comp = r.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
      return comp && (comp.sourceCountryId === countryId || comp.targetCountryId === countryId) && comp.affinity > 0.5;
    });
    if (allyRelations.length > 0 && indicator) {
      const ally = allyRelations[0]!.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
      const allyId = ally?.sourceCountryId === countryId ? ally.targetCountryId : ally?.sourceCountryId;
      if (allyId) {
        goals.push({
          goalId: `establish-trade-${countryId}-${allyId}`,
          description: `Establish trade route with ally ${allyId}`,
          targetCountryId: allyId as EntityId,
          priority: 50,
        });
      }
    }

    return goals;
  };

  /** Default prioritizer — weights goals by personality traits. */
  private static defaultPrioritizer: IGoalPrioritizer = (goals, personality) => {
    return goals.slice().sort((a, b) => {
      const scoreA = GoalManager.personalityWeightedScore(a, personality);
      const scoreB = GoalManager.personalityWeightedScore(b, personality);
      return scoreB - scoreA;
    });
  };

  private static personalityWeightedScore(goal: IManagedGoal, p: IAgentPersonality): number {
    let score = goal.priority;
    const desc = goal.description.toLowerCase();

    if (desc.includes('military') || desc.includes('war') || desc.includes('readiness')) {
      score *= 0.5 + p.aggressiveness;
    }
    if (desc.includes('trade') || desc.includes('diplomat') || desc.includes('treaty')) {
      score *= 0.5 + p.trustPropensity;
    }
    if (desc.includes('invest') || desc.includes('boost') || desc.includes('treasury')) {
      score *= 0.5 + (1 - p.riskTolerance);
    }
    if (desc.includes('stability')) {
      score *= 0.5 + (1 - p.riskTolerance);
    }

    return score;
  }
}
