import { EntityId } from '../../core/interfaces/entity.interface.js';
import { IWorldState } from '../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../core/interfaces/event-bus.interface.js';
import { PerceptionFilter } from '../perception/perception-filter.js';
import { AgentMemory, IAgentPersonality } from '../memory/agent-memory.js';
import { StrictIntentParser } from '../parser/strict-intent-parser.js';
import {
  DIPLOMATIC_RELATION_TYPE,
  RelationComponent,
} from '../../domain/diplomacy/components/relation.component.js';
import { MILITARY_DETAIL_TYPE } from '../../domain/war/components/military-detail.component.js';
import { evaluateMilitaryParity, buildWarActionPayload } from '../evaluation/military-parity.js';

export interface IAgentControllerConfig {
  readonly countryId: EntityId;
  readonly personality?: Partial<IAgentPersonality>;
  /** Optional custom LLM decision evaluator function. */
  readonly llmEvaluator?: (prompt: string) => Promise<string> | string;
  /** Intel level for Fog of War distortion (0.0 blind to 1.0 perfect). Default: 0.5 */
  readonly intelLevel?: number;
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
  private readonly intelLevel: number;
  private readonly personality: IAgentPersonality;

  constructor(config: IAgentControllerConfig) {
    this.countryId = config.countryId;
    this.memory = new AgentMemory(config.countryId, config.personality);
    this.intelLevel = config.intelLevel ?? 0.5;
    this.personality = {
      aggressiveness: config.personality?.aggressiveness ?? 0.5,
      riskTolerance: config.personality?.riskTolerance ?? 0.5,
      trustPropensity: config.personality?.trustPropensity ?? 0.5,
    };
    if (config.llmEvaluator) {
      this.llmEvaluator = config.llmEvaluator;
    }
  }

  /**
   * Execute an agent decision cycle for the current tick under Fog of War.
   */
  public async evaluateTick(worldState: Readonly<IWorldState>, eventBus: IEventBus): Promise<boolean> {
    // 0. Intel-driven war/peace pre-check — evaluate military parity against
    // hostile nations using distorted perception (Fog of War)
    const warAction = this.evaluateWarDecision(worldState);
    if (warAction) {
      this.memory.recordDecision(
        warAction.narrativeSummary,
        warAction.actionType,
        worldState.getMetadata().currentTick as number,
      );
      eventBus.publish(
        warAction.actionType,
        warAction.parameters,
        `agent.${this.countryId}`,
        this.countryId,
      );
      return true;
    }

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
    const tick = worldState.getMetadata().currentTick;
    this.memory.recordDecision(payload.narrativeSummary ?? payload.actionType, payload.actionType, tick as number);

    // 7. Emit validated action onto EventBus
    eventBus.publish(
      payload.actionType,
      payload.parameters,
      `agent.${this.countryId}`,
      this.countryId,
    );

    return true;
  }

  /**
   * Evaluate whether the agent should declare war or request peace based on
   * military parity using distorted (Fog of War) perception of enemies.
   */
  private evaluateWarDecision(
    worldState: Readonly<IWorldState>,
  ): { actionType: string; parameters: Record<string, unknown>; narrativeSummary: string } | null {
    const selfEntity = worldState.getEntity(this.countryId);
    if (!selfEntity?.getComponent(MILITARY_DETAIL_TYPE)) return null;

    const relations = worldState.getEntitiesByComponent(DIPLOMATIC_RELATION_TYPE);
    for (const relEntity of relations) {
      const rel = relEntity.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
      if (!rel) continue;
      if (rel.targetCountryId !== this.countryId && relEntity.id !== this.countryId) continue;

      const targetId = rel.targetCountryId === this.countryId ? relEntity.id : rel.targetCountryId;
      if (!targetId) continue;
      if (rel.affinity >= -0.3 || rel.tension < 0.6) continue;

      const assessment = evaluateMilitaryParity(worldState, this.countryId, targetId, {
        intelLevel: this.intelLevel,
        aggressiveness: this.personality.aggressiveness,
        riskTolerance: this.personality.riskTolerance,
      });
      if (!assessment) continue;

      if (assessment.recommendation === 'declare-war' || assessment.recommendation === 'request-peace') {
        return buildWarActionPayload(this.countryId, targetId, assessment);
      }
    }

    return null;
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
