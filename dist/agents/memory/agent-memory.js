/**
 * Manages short-term decision history, long-term Timeline queries, and personality profiles.
 */
export class AgentMemory {
    countryId;
    personality;
    goals = [];
    recentDecisions = [];
    constructor(countryId, personality = {}) {
        this.countryId = countryId;
        this.personality = {
            aggressiveness: personality.aggressiveness ?? 0.5,
            riskTolerance: personality.riskTolerance ?? 0.5,
            trustPropensity: personality.trustPropensity ?? 0.5,
        };
    }
    addGoal(goal) {
        this.goals.push(goal);
    }
    getActiveGoals() {
        return this.goals;
    }
    recordDecision(decisionSummary) {
        this.recentDecisions.push(decisionSummary);
        if (this.recentDecisions.length > 10) {
            this.recentDecisions.shift(); // Keep last 10 decisions
        }
    }
    getRecentDecisions() {
        return this.recentDecisions;
    }
    /**
     * Query historical Timeline events relevant to this country agent.
     */
    queryRelevantHistory(timeline, limit = 5) {
        return timeline.query({
            entityId: this.countryId,
            limit,
        });
    }
}
//# sourceMappingURL=agent-memory.js.map