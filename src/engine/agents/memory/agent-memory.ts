import { EntityId } from '../../core/interfaces/entity.interface.js';
import { ITimeline, ITimelineEntry } from '../../core/interfaces/timeline.interface.js';
import { IAgentMemoryStore, IAgentDecision } from './memory-store.interface.js';
import { InMemoryAgentMemoryStore } from './in-memory-memory-store.js';

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
 * Manages short-term decision history, long-term Timeline queries, personality profiles,
 * and persistent memory via IAgentMemoryStore.
 */
export class AgentMemory {
  readonly countryId: EntityId;
  readonly personality: IAgentPersonality;
  private readonly goals: IAgentStrategicGoal[] = [];
  private readonly store: IAgentMemoryStore;

  constructor(countryId: EntityId, personality: Partial<IAgentPersonality> = {}, store?: IAgentMemoryStore) {
    this.countryId = countryId;
    this.personality = {
      aggressiveness: personality.aggressiveness ?? 0.5,
      riskTolerance: personality.riskTolerance ?? 0.5,
      trustPropensity: personality.trustPropensity ?? 0.5,
    };
    this.store = store ?? new InMemoryAgentMemoryStore();
  }

  public addGoal(goal: IAgentStrategicGoal): void {
    if (!this.goals.some((g) => g.goalId === goal.goalId)) {
      this.goals.push(goal);
    }
  }

  public getActiveGoals(): ReadonlyArray<IAgentStrategicGoal> {
    return this.goals;
  }

  public clearGoal(goalId: string): void {
    const idx = this.goals.findIndex((g) => g.goalId === goalId);
    if (idx >= 0) this.goals.splice(idx, 1);
  }

  public recordDecision(decisionSummary: string, actionType: string = 'unknown', tick: number = 0): void {
    const decision: IAgentDecision = {
      tick,
      actionType,
      narrativeSummary: decisionSummary,
      timestamp: Date.now(),
    };
    this.store.saveDecision(this.countryId, decision);
  }

  public getRecentDecisions(limit: number = 10): readonly string[] {
    const result = this.store.getRecentDecisions(this.countryId, limit);
    if (Array.isArray(result)) {
      return result.map((d) => d.narrativeSummary);
    }
    return [];
  }

  public getRecentDecisionRecords(limit: number = 10): readonly IAgentDecision[] {
    const result = this.store.getRecentDecisions(this.countryId, limit);
    if (Array.isArray(result)) return result;
    return [];
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

  /** Get the personality as a descriptive profile string for prompt construction. */
  public getPersonalityProfile(): string {
    const aggr = this.personality.aggressiveness > 0.7 ? 'aggressive' : this.personality.aggressiveness < 0.3 ? 'cautious' : 'moderate';
    const risk = this.personality.riskTolerance > 0.7 ? 'risk-seeking' : this.personality.riskTolerance < 0.3 ? 'risk-averse' : 'balanced';
    const trust = this.personality.trustPropensity > 0.7 ? 'trusting' : this.personality.trustPropensity < 0.3 ? 'suspicious' : 'pragmatic';
    return `Personality: ${aggr}, ${risk}, ${trust} (aggressiveness=${this.personality.aggressiveness.toFixed(2)}, riskTolerance=${this.personality.riskTolerance.toFixed(2)}, trustPropensity=${this.personality.trustPropensity.toFixed(2)})`;
  }
}
