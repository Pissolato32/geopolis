import { PerceptionFilter } from '../perception/perception-filter.js';
import { AgentMemory } from '../memory/agent-memory.js';
import { StrictIntentParser } from '../parser/strict-intent-parser.js';
/**
 * Controller orchestrating a country AI leader agent.
 * Handles Fog of War perception gathering, memory, decision evaluation, and action submission.
 */
export class AgentController {
    countryId;
    memory;
    parser = new StrictIntentParser();
    llmEvaluator;
    constructor(config) {
        this.countryId = config.countryId;
        this.memory = new AgentMemory(config.countryId, config.personality);
        if (config.llmEvaluator) {
            this.llmEvaluator = config.llmEvaluator;
        }
    }
    /**
     * Execute an agent decision cycle for the current tick under Fog of War.
     */
    async evaluateTick(worldState, eventBus) {
        // 1. Gather Fog of War perception dump (dense YAML)
        const perceptionDump = PerceptionFilter.generatePerceptionDump(worldState, this.countryId);
        // 2. Build decision prompt context
        const prompt = this.buildPrompt(perceptionDump);
        // 3. Obtain LLM response (or default rule evaluation if no LLM attached)
        const rawResponse = this.llmEvaluator
            ? await this.llmEvaluator(prompt)
            : this.generateDefaultAction(this.countryId);
        // 4. Parse JSON action payload
        const payload = this.parser.parsePayload(rawResponse);
        if (!payload)
            return false;
        // 5. Validate action payload (Fail Fast)
        const validation = this.parser.validate(payload, worldState.getMetadata().currentTick);
        if (!validation.isValid || !validation.validatedPayload)
            return false;
        // 6. Record decision in agent memory
        this.memory.recordDecision(payload.narrativeSummary ?? payload.actionType);
        // 7. Emit validated action onto EventBus
        eventBus.publish(payload.actionType, payload.parameters, `agent.${this.countryId}`, this.countryId);
        return true;
    }
    buildPrompt(perceptionDump) {
        const goals = this.memory.getActiveGoals().map((g) => g.description).join('; ');
        return `You are the political leader of ${this.countryId}.
Active Goals: ${goals || 'Maintain stability and prosperity'}

PERCEIVED WORLD STATE (YAML):
${perceptionDump}

Formulate your strategic decision for this tick and return a JSON action payload.`;
    }
    generateDefaultAction(countryId) {
        return `\`\`\`json
{
  "actionType": "politics.maintain-stability",
  "actorEntityId": "${countryId}",
  "parameters": {},
  "narrativeSummary": "Maintained governance stability"
}
\`\`\``;
    }
}
//# sourceMappingURL=agent-controller.js.map