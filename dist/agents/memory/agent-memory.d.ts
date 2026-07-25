import { EntityId } from '../../core/interfaces/entity.interface.js';
import { ITimeline, ITimelineEntry } from '../../core/interfaces/timeline.interface.js';
export interface IAgentPersonality {
    readonly aggressiveness: number;
    readonly riskTolerance: number;
    readonly trustPropensity: number;
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
export declare class AgentMemory {
    readonly countryId: EntityId;
    readonly personality: IAgentPersonality;
    private readonly goals;
    private readonly recentDecisions;
    constructor(countryId: EntityId, personality?: Partial<IAgentPersonality>);
    addGoal(goal: IAgentStrategicGoal): void;
    getActiveGoals(): ReadonlyArray<IAgentStrategicGoal>;
    recordDecision(decisionSummary: string): void;
    getRecentDecisions(): ReadonlyArray<string>;
    /**
     * Query historical Timeline events relevant to this country agent.
     */
    queryRelevantHistory(timeline: Readonly<ITimeline>, limit?: number): ReadonlyArray<ITimelineEntry>;
}
//# sourceMappingURL=agent-memory.d.ts.map