import { EntityId } from '../../core/interfaces/entity.interface.js';
import { ITimeline, ITimelineEntry } from '../../core/interfaces/timeline.interface.js';

export interface IAgentPersonality {
  readonly aggressiveness: number; // 0.0 (pacifist) to 1.0 (warmonger)
  readonly riskTolerance: number; // 0.0 (cautious) to 1.0 (reckless)
  readonly trustPropensity: number; // 0.0 (paranoid) to 1.0 (naive)
}

export interface IAgentStrategicGoal {
  readonly goalId: string;
  readonly description: string;
  readonly targetCountryId?: EntityId;
  readonly priority: number;
}

/**
 * Manages short-term decision history, long-term Timeline queries, and personality profiles.
 */
export class AgentMemory {
  readonly countryId: EntityId;
  readonly personality: IAgentPersonality;
  private readonly goals: IAgentStrategicGoal[] = [];
  private readonly recentDecisions: string[] = [];

  constructor(countryId: EntityId, personality: Partial<IAgentPersonality> = {}) {
    this.countryId = countryId;
    this.personality = {
      aggressiveness: personality.aggressiveness ?? 0.5,
      riskTolerance: personality.riskTolerance ?? 0.5,
      trustPropensity: personality.trustPropensity ?? 0.5,
    };
  }

  public addGoal(goal: IAgentStrategicGoal): void {
    this.goals.push(goal);
  }

  public getActiveGoals(): ReadonlyArray<IAgentStrategicGoal> {
    return this.goals;
  }

  public recordDecision(decisionSummary: string): void {
    this.recentDecisions.push(decisionSummary);
    if (this.recentDecisions.length > 10) {
      this.recentDecisions.shift(); // Keep last 10 decisions
    }
  }

  public getRecentDecisions(): ReadonlyArray<string> {
    return this.recentDecisions;
  }

  /**
   * Query historical Timeline events relevant to this country agent.
   */
  public queryRelevantHistory(timeline: Readonly<ITimeline>, limit: number = 5): ReadonlyArray<ITimelineEntry> {
    return timeline.query({
      entityId: this.countryId,
      limit,
    });
  }
}
