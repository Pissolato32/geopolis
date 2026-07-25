import { ISystem, SystemPriority } from '../../core/interfaces/system.interface.js';
import { IWorldState } from '../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../core/interfaces/event-bus.interface.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';
import { PerceptionFilter } from '../perception/perception-filter.js';
import { AgentMemory, IAgentPersonality } from '../memory/agent-memory.js';
import { StrictIntentParser } from '../parser/strict-intent-parser.js';
import { ILlmProvider } from '../llm/llm-provider.interface.js';
import { HeuristicAgentProvider, IHeuristicContext } from '../llm/heuristic.provider.js';
import { ECONOMIC_INDICATOR_TYPE, RESOURCE_PRODUCTION_TYPE } from '../../domain/economy/components/economy.components.js';
import { GOVERNMENT_STABILITY_TYPE } from '../../domain/politics/components/politics.components.js';
import { DIPLOMATIC_RELATION_TYPE } from '../../domain/diplomacy/components/relation.component.js';

export const AGENT_SYSTEM_ID = 'agent.evaluator';

interface IAgentRecord {
  countryId: EntityId;
  memory: AgentMemory;
}

export interface IAgentSystemConfig {
  readonly provider?: ILlmProvider;
  readonly evaluator?: (prompt: string, systemPrompt?: string) => string;
  readonly controlledEntities?: ReadonlyArray<EntityId>;
  readonly personality?: Partial<IAgentPersonality>;
}

export class AgentSystem implements ISystem {
  readonly descriptor = {
    id: AGENT_SYSTEM_ID,
    name: 'Agent Evaluator System',
    priority: 40 as SystemPriority,
    requiredComponents: [],
    subscribedEvents: [],
    emittedEvents: [],
  };

  private readonly agents: IAgentRecord[] = [];
  private readonly parser = new StrictIntentParser();
  private readonly provider: ILlmProvider | undefined;
  private readonly evaluator: ((prompt: string, systemPrompt?: string) => string) | undefined;
  private readonly personality: Partial<IAgentPersonality> | undefined;

  constructor(config: IAgentSystemConfig = {}) {
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

  discoverAgents(state: Readonly<IWorldState>): void {
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

  getAgentCount(): number {
    return this.agents.length;
  }

  getAgents(): ReadonlyArray<IAgentRecord> {
    return this.agents;
  }

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    this.discoverAgents(state);

    if (!this.provider && !this.evaluator) return;

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
      } else if (this.provider) {
        this.provider.evaluate(prompt).then((rawResponse) => {
          this.processResponse(rawResponse, agent, state, eventBus);
        });
      }
    }
  }

  private collectHeuristicContext(
    state: Readonly<IWorldState>,
    countryId: EntityId,
  ): IHeuristicContext {
    const entity = state.getEntity(countryId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const indicator = entity?.getComponent<any>(ECONOMIC_INDICATOR_TYPE);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stability = entity?.getComponent<any>(GOVERNMENT_STABILITY_TYPE);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const production = entity?.getComponent<any>(RESOURCE_PRODUCTION_TYPE);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const relation = entity?.getComponent<any>(DIPLOMATIC_RELATION_TYPE);

    const affinity = relation?.['affinity'] as number | undefined;
    const tension = relation?.['tension'] as number | undefined;
    const targetId = relation?.['targetCountryId'] as string | undefined;

    return {
      countryId,
      metrics: {
        stabilityIndex: stability?.['stabilityIndex'] as number | undefined,
        treasury: indicator?.['treasury'] as number | undefined,
        gdp: indicator?.['gdp'] as number | undefined,
        foodOutput: production?.['foodOutput'] as number | undefined,
        lowestAffinity: affinity,
        lowestAffinityTarget: affinity !== undefined ? targetId : undefined,
        highestTension: tension,
        highestTensionTarget: tension !== undefined ? targetId : undefined,
        highestAffinity: affinity,
        highestAffinityTarget: affinity !== undefined ? targetId : undefined,
      },
    } as IHeuristicContext;
  }

  private processResponse(
    rawResponse: string,
    agent: IAgentRecord,
    state: Readonly<IWorldState>,
    eventBus: IEventBus,
  ): void {
    const payload = this.parser.parsePayload(rawResponse);
    if (!payload) return;

    const validation = this.parser.validate(payload, state.getMetadata().currentTick);
    if (!validation.isValid || !validation.validatedPayload) return;

    agent.memory.recordDecision(validation.validatedPayload.narrativeSummary ?? validation.validatedPayload.actionType);

    eventBus.publish(
      validation.validatedPayload.actionType,
      validation.validatedPayload.parameters,
      `agent.${agent.countryId}`,
      agent.countryId,
    );
  }

  private buildPrompt(perceptionDump: string, memory: AgentMemory): string {
    const goals = memory.getActiveGoals().map((g) => g.description).join('; ');
    return `You are the political leader of ${memory.countryId}.
Active Goals: ${goals || 'Maintain stability and prosperity'}

PERCEIVED WORLD STATE (YAML):
${perceptionDump}

Formulate your strategic decision for this tick and return a JSON action payload.`;
  }
}
