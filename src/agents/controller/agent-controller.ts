import { EntityId } from '../../core/interfaces/entity.interface.js';
import { IWorldState } from '../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../core/interfaces/event-bus.interface.js';
import { PerceptionFilter } from '../perception/perception-filter.js';
import { AgentMemory, IAgentPersonality } from '../memory/agent-memory.js';
import { StrictIntentParser } from '../parser/strict-intent-parser.js';

export interface IAgentControllerConfig {
  readonly countryId: EntityId;
  readonly personality?: Partial<IAgentPersonality>;
  /** Optional custom LLM decision evaluator function. */
  readonly llmEvaluator?: (prompt: string) => Promise<string> | string;
}

/**
 * Controller orchestrating a country AI leader agent.
 * Handles Fog of War perception gathering, memory, decision evaluation, and action submission.
 */
export class AgentController {
  readonly countryId: EntityId;
  readonly memory: AgentMemory;
  private readonly parser = new StrictIntentParser();
  private readonly llmEvaluator?: (prompt: string) => Promise<string> | string;

  constructor(config: IAgentControllerConfig) {
    this.countryId = config.countryId;
    this.memory = new AgentMemory(config.countryId, config.personality);
    if (config.llmEvaluator) {
      this.llmEvaluator = config.llmEvaluator;
    }
  }

  /**
   * Execute an agent decision cycle for the current tick under Fog of War.
   */
  public async evaluateTick(worldState: Readonly<IWorldState>, eventBus: IEventBus): Promise<boolean> {
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
    if (!payload) return false;

    // 5. Validate action payload (Fail Fast)
    const validation = this.parser.validate(payload, worldState.getMetadata().currentTick);
    if (!validation.isValid || !validation.validatedPayload) return false;

    // 6. Record decision in agent memory
    this.memory.recordDecision(payload.narrativeSummary ?? payload.actionType);

    // 7. Emit validated action onto EventBus
    eventBus.publish(
      payload.actionType,
      payload.parameters,
      `agent.${this.countryId}`,
      this.countryId,
    );

    return true;
  }

  private buildPrompt(perceptionDump: string): string {
    const goals = this.memory.getActiveGoals().map((g) => g.description).join('; ');
    return `You are the political leader of ${this.countryId}.
Active Goals: ${goals || 'Maintain stability and prosperity'}

PERCEIVED WORLD STATE (YAML):
${perceptionDump}

Formulate your strategic decision for this tick and return a JSON action payload.`;
  }

  private generateDefaultAction(countryId: string): string {
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
