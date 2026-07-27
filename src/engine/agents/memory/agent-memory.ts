import { EntityId } from '../../core/interfaces/entity.interface.js';
import { ITimeline, ITimelineEntry } from '../../core/interfaces/timeline.interface.js';
import { IAgentMemoryStore, IAgentDecision, IAgentEpisode, IAgentGrievance, GrievanceType, IGrievanceFilter } from './memory-store.interface.js';
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

const EPISODE_SUMMARY_THRESHOLD = 10;

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

  /**
   * Compress recent decisions into an episodic memory summary.
   * When the decision history exceeds EPISODE_SUMMARY_THRESHOLD, older decisions
   * are collapsed into a single narrative episode and persisted via the store.
   */
  public summarizeEpisodes(currentTick: number): IAgentEpisode | undefined {
    const decisions = this.getRecentDecisionRecords(EPISODE_SUMMARY_THRESHOLD + 5);
    if (decisions.length < EPISODE_SUMMARY_THRESHOLD) return undefined;

    const toCompress = decisions.slice(0, -EPISODE_SUMMARY_THRESHOLD);
    if (toCompress.length === 0) return undefined;

    const actionTypes = toCompress.map((d) => d.actionType);
    const uniqueTypes = [...new Set(actionTypes)];
    const tickRange = `${toCompress[0]!.tick}-${toCompress[toCompress.length - 1]!.tick}`;
    const summary = `Episode [${tickRange}]: ${toCompress.length} decisions (${uniqueTypes.join(', ')}). Dominant: ${this.dominantActionType(actionTypes)}.`;

    const episode: IAgentEpisode = {
      episodeId: `ep-${this.countryId}-${currentTick}`,
      summary,
      startTick: toCompress[0]!.tick,
      endTick: toCompress[toCompress.length - 1]!.tick,
      createdAt: Date.now(),
    };

    this.store.saveEpisode(this.countryId, episode);
    return episode;
  }

  public queryEpisodes(sinceTick: number = 0, limit: number = 10): readonly IAgentEpisode[] {
    const result = this.store.queryEpisodes({ countryId: this.countryId, sinceTick, limit });
    if (Array.isArray(result)) return result;
    return [];
  }

  /** Record a historical grievance against a perpetrator nation.
   *  Grievances include broken treaties, active sanctions, and unprovoked threats. */
  public recordGrievance(
    perpetratorId: EntityId,
    grievanceType: GrievanceType,
    description: string,
    tick: number,
    severity: number = 0.5,
  ): void {
    const grievance: IAgentGrievance = {
      grievanceId: `grievance-${this.countryId}-${perpetratorId}-${grievanceType}-${tick}`,
      countryId: this.countryId,
      perpetratorId,
      grievanceType,
      description,
      tick,
      severity: Math.max(0, Math.min(1, severity)),
      timestamp: Date.now(),
    };
    this.store.saveGrievance(this.countryId, grievance);
  }

  /** Get all grievances this nation holds, optionally filtered by perpetrator. */
  public getGrievances(perpetratorId?: EntityId): readonly IAgentGrievance[] {
    const filter: IGrievanceFilter = {
      countryId: this.countryId,
      perpetratorId,
      limit: 100,
    };
    const result = this.store.getGrievances(filter);
    if (Array.isArray(result)) return result;
    return [];
  }

  /** Get grievances against a specific perpetrator, sorted by severity (most severe first). */
  public getGrievancesAgainst(perpetratorId: EntityId): readonly IAgentGrievance[] {
    const all = this.getGrievances(perpetratorId);
    return [...all].sort((a, b) => b.severity - a.severity);
  }

  /** Calculate the distrust penalty for a given perpetrator based on
n   *  accumulated grievances. Returns a value from 0 (no penalty) to -50.
   *  Each grievance contributes a penalty proportional to its severity:
   *    - broken-treaty:  severity * 50
   *    - betrayal:       severity * 50
   *    - active-sanction: severity * 35
   *    - unprovoked-threat: severity * 25
   *  Multiple grievances stack, capped at -50 total. */
  public getDistrustPenalty(perpetratorId: EntityId): number {
    const grievances = this.getGrievancesAgainst(perpetratorId);
    if (grievances.length === 0) return 0;

    let totalPenalty = 0;
    for (const g of grievances) {
      const basePenalty: Record<GrievanceType, number> = {
        'broken-treaty': 50,
        'betrayal': 50,
        'active-sanction': 35,
        'unprovoked-threat': 25,
      };
      totalPenalty += g.severity * basePenalty[g.grievanceType]!;
    }

    // Clamp to -50 maximum distrust penalty
    return Math.max(-50, -totalPenalty);
  }

  /** Get a human-readable summary of grievances for prompt construction. */
  public getGrievanceSummary(): string {
    const grievances = this.getGrievances();
    if (grievances.length === 0) return 'No recorded grievances.';

    const byPerpetrator = new Map<EntityId, IAgentGrievance[]>();
    for (const g of grievances) {
      const list = byPerpetrator.get(g.perpetratorId) ?? [];
      list.push(g);
      byPerpetrator.set(g.perpetratorId, list);
    }

    const lines: string[] = ['Historical Grievances:'];
    for (const [perp, list] of byPerpetrator) {
      const distrust = this.getDistrustPenalty(perp);
      const types = list.map((g) => g.grievanceType).join(', ');
      lines.push(`  - ${perp}: ${list.length} grievance(s) [${types}] → distrust penalty: ${distrust} affinity`);
    }
    return lines.join('\n');
  }

  private dominantActionType(types: readonly string[]): string {
    const counts = new Map<string, number>();
    for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
    let max = 0;
    let dominant = 'unknown';
    for (const [type, count] of counts) {
      if (count > max) { max = count; dominant = type; }
    }
    return dominant;
  }
}
