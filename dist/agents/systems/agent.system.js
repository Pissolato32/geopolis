import { PerceptionFilter } from '../perception/perception-filter.js';
import { AgentMemory } from '../memory/agent-memory.js';
import { StrictIntentParser } from '../parser/strict-intent-parser.js';
import { HeuristicAgentProvider } from '../llm/heuristic.provider.js';
import { ECONOMIC_INDICATOR_TYPE, RESOURCE_PRODUCTION_TYPE } from '../../domain/economy/components/economy.components.js';
import { GOVERNMENT_STABILITY_TYPE } from '../../domain/politics/components/politics.components.js';
import { DIPLOMATIC_RELATION_TYPE } from '../../domain/diplomacy/components/relation.component.js';
export const AGENT_SYSTEM_ID = 'agent.evaluator';
export class AgentSystem {
    descriptor = {
        id: AGENT_SYSTEM_ID,
        name: 'Agent Evaluator System',
        priority: 40,
        requiredComponents: [],
        subscribedEvents: [],
        emittedEvents: [],
    };
    agents = [];
    parser = new StrictIntentParser();
    provider;
    evaluator;
    personality;
    constructor(config = {}) {
        this.provider = config.provider;
        this.evaluator = config.evaluator;
        this.personality = config.personality;
        if (config.controlledEntities) {
            for (const id of config.controlledEntities) {
                this.agents.push({
                    countryId: id,
                    memory: new AgentMemory(id, this.personality),
                });
            }
        }
    }
    discoverAgents(state) {
        const existing = new Set(this.agents.map((a) => a.countryId));
        const countries = state.getEntitiesByComponent(ECONOMIC_INDICATOR_TYPE);
        for (const entity of countries) {
            if (!existing.has(entity.id)) {
                this.agents.push({
                    countryId: entity.id,
                    memory: new AgentMemory(entity.id, this.personality),
                });
                existing.add(entity.id);
            }
        }
    }
    getAgentCount() {
        return this.agents.length;
    }
    getAgents() {
        return this.agents;
    }
    execute(state, eventBus) {
        this.discoverAgents(state);
        if (!this.provider && !this.evaluator)
            return;
        for (const agent of this.agents) {
            if (this.provider instanceof HeuristicAgentProvider) {
                const ctx = this.collectHeuristicContext(state, agent.countryId);
                this.provider.setContext(ctx);
            }
            const perceptionDump = PerceptionFilter.generatePerceptionDump(state, agent.countryId);
            const prompt = this.buildPrompt(perceptionDump, agent.memory);
            if (this.evaluator) {
                const rawResponse = this.evaluator(prompt);
                this.processResponse(rawResponse, agent, state, eventBus);
            }
            else if (this.provider) {
                this.provider.evaluate(prompt).then((rawResponse) => {
                    this.processResponse(rawResponse, agent, state, eventBus);
                });
            }
        }
    }
    collectHeuristicContext(state, countryId) {
        const entity = state.getEntity(countryId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const indicator = entity?.getComponent(ECONOMIC_INDICATOR_TYPE);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stability = entity?.getComponent(GOVERNMENT_STABILITY_TYPE);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const production = entity?.getComponent(RESOURCE_PRODUCTION_TYPE);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const relation = entity?.getComponent(DIPLOMATIC_RELATION_TYPE);
        const affinity = relation?.['affinity'];
        const tension = relation?.['tension'];
        const targetId = relation?.['targetCountryId'];
        return {
            countryId,
            metrics: {
                stabilityIndex: stability?.['stabilityIndex'],
                treasury: indicator?.['treasury'],
                gdp: indicator?.['gdp'],
                foodOutput: production?.['foodOutput'],
                lowestAffinity: affinity,
                lowestAffinityTarget: affinity !== undefined ? targetId : undefined,
                highestTension: tension,
                highestTensionTarget: tension !== undefined ? targetId : undefined,
                highestAffinity: affinity,
                highestAffinityTarget: affinity !== undefined ? targetId : undefined,
            },
        };
    }
    processResponse(rawResponse, agent, state, eventBus) {
        const payload = this.parser.parsePayload(rawResponse);
        if (!payload)
            return;
        const validation = this.parser.validate(payload, state.getMetadata().currentTick);
        if (!validation.isValid || !validation.validatedPayload)
            return;
        agent.memory.recordDecision(validation.validatedPayload.narrativeSummary ?? validation.validatedPayload.actionType);
        eventBus.publish(validation.validatedPayload.actionType, validation.validatedPayload.parameters, `agent.${agent.countryId}`, agent.countryId);
    }
    buildPrompt(perceptionDump, memory) {
        const goals = memory.getActiveGoals().map((g) => g.description).join('; ');
        return `You are the political leader of ${memory.countryId}.
Active Goals: ${goals || 'Maintain stability and prosperity'}

PERCEIVED WORLD STATE (YAML):
${perceptionDump}

Formulate your strategic decision for this tick and return a JSON action payload.`;
    }
}
//# sourceMappingURL=agent.system.js.map