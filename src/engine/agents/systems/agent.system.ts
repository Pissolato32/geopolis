import { ISystem, SystemPriority } from '../../core/interfaces/system.interface.js';
import { IWorldState } from '../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../core/interfaces/event-bus.interface.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';
import { PerceptionFilter } from '../perception/perception-filter.js';
import { AgentMemory, IAgentPersonality } from '../memory/agent-memory.js';
import { IAgentMemoryStore } from '../memory/memory-store.interface.js';
import { InMemoryAgentMemoryStore } from '../memory/in-memory-memory-store.js';
import { StrictIntentParser } from '../parser/strict-intent-parser.js';
import { ILlmProvider } from '../llm/llm-provider.interface.js';
import { HeuristicAgentProvider, IHeuristicContext } from '../llm/heuristic.provider.js';
import { GoalManager } from '../goal-manager.js';
import { ECONOMIC_INDICATOR_TYPE, RESOURCE_PRODUCTION_TYPE } from '../../domain/economy/components/economy.components.js';
import { GOVERNMENT_STABILITY_TYPE } from '../../domain/politics/components/politics.components.js';
import { DIPLOMATIC_RELATION_TYPE } from '../../domain/diplomacy/components/relation.component.js';
import { INTELLIGENCE_AGENCY_TYPE, IntelligenceAgencyComponent } from '../../domain/intelligence/components/intelligence.components.js';

export const AGENT_SYSTEM_ID = 'agent.evaluator';

interface IAgentRecord {
  countryId: EntityId;
  memory: AgentMemory;
  goalManager: GoalManager;
}

export interface IAgentSystemConfig {
  readonly provider?: ILlmProvider;
  readonly evaluator?: (prompt: string, systemPrompt?: string) => string;
  readonly controlledEntities?: ReadonlyArray<EntityId>;
  readonly personality?: Partial<IAgentPersonality>;
  readonly memoryStore?: IAgentMemoryStore;
  /** Intel level for perception filter (0.0-1.0). Lower = more fog-of-war distortion. */
  readonly defaultIntelLevel?: number;
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
  private readonly memoryStore: IAgentMemoryStore;
  private readonly defaultIntelLevel: number;

  constructor(config: IAgentSystemConfig = {}) {
    this.provider = config.provider;
    this.evaluator = config.evaluator;
    this.personality = config.personality;
    this.memoryStore = config.memoryStore ?? new InMemoryAgentMemoryStore();
    this.defaultIntelLevel = config.defaultIntelLevel ?? 1.0;

    if (config.controlledEntities) {
      for (const id of config.controlledEntities) {
        this.registerAgent(id);
      }
    }
  }

  private registerAgent(id: EntityId): IAgentRecord {
    const fullPersonality: IAgentPersonality = {
      aggressiveness: this.personality?.aggressiveness ?? 0.5,
      riskTolerance: this.personality?.riskTolerance ?? 0.5,
      trustPropensity: this.personality?.trustPropensity ?? 0.5,
    };
    const memory = new AgentMemory(id, this.personality, this.memoryStore);
    const goalManager = new GoalManager(id, fullPersonality);
    const record: IAgentRecord = { countryId: id, memory, goalManager };
    this.agents.push(record);
    return record;
  }

  discoverAgents(state: Readonly<IWorldState>): void {
    const existing = new Set(this.agents.map((a) => a.countryId));
    const countries = state.getEntitiesByComponent(ECONOMIC_INDICATOR_TYPE);

    for (const entity of countries) {
      if (!existing.has(entity.id)) {
        this.registerAgent(entity.id);
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

    const tick = state.getMetadata().currentTick;

    for (const agent of this.agents) {
      agent.goalManager.evaluateGoals(state, agent.countryId, tick);

      const intelLevel = this.getIntelLevel(state, agent.countryId);

      if (this.provider instanceof HeuristicAgentProvider) {
        const ctx = this.collectHeuristicContext(state, agent.countryId);
        this.provider.setContext(ctx);
      }

      const perceptionDump = PerceptionFilter.generatePerceptionDump(state, agent.countryId, {
        intelLevel,
      });

      const systemPrompt = this.buildSystemPrompt(agent);
      const prompt = this.buildPrompt(perceptionDump, agent, tick);

      if (this.evaluator) {
        const rawResponse = this.evaluator(prompt, systemPrompt);
        this.processResponse(rawResponse, agent, state, eventBus, tick);
      } else if (this.provider instanceof HeuristicAgentProvider) {
        const rawResponse = this.provider.decideSync(prompt, systemPrompt);
        this.processResponse(rawResponse, agent, state, eventBus, tick);
      } else if (this.provider) {
        void this.provider.evaluate(prompt, systemPrompt)
          .then((rawResponse) => {
            this.processResponse(rawResponse, agent, state, eventBus, tick);
          })
          .catch(() => {
            // Silently ignore or handle provider network/evaluation failures
          });
      }
    }
  }

  /** Get intel level from the country's IntelligenceAgencyComponent, or fall back to default. */
  private getIntelLevel(state: Readonly<IWorldState>, countryId: EntityId): number {
    const entity = state.getEntity(countryId);
    if (!entity) return this.defaultIntelLevel;
    const agency = entity.getComponent<IntelligenceAgencyComponent>(INTELLIGENCE_AGENCY_TYPE);
    if (agency && typeof agency.intelCapability === 'number') {
      return agency.intelCapability;
    }
    return this.defaultIntelLevel;
  }

  private buildSystemPrompt(agent: IAgentRecord): string {
    const goals = agent.goalManager.getActiveGoals();
    const goalList = goals.length > 0
      ? goals.slice(0, 5).map((g) => `- [P${g.priority}] ${g.description}`).join('\n')
      : 'Maintain stability and prosperity';

    return `You are the autonomous political leader of ${agent.countryId}.
${agent.memory.getPersonalityProfile()}

ACTIVE STRATEGIC GOALS (priority order):
${goalList}

You must respond with a single JSON action payload wrapped in a \`\`\`json code block.
The payload must contain: actionType, actorEntityId, parameters, and narrativeSummary.
Choose from these action types:
- politics.maintain-stability
- economy.invest
- economy.establish-trade-route
- economy.close-trade-route
- economy.impose-sanction
- economy.lift-sanction
- economy.adjust-tax
- military.deploy-unit
- diplomacy.propose-treaty
- diplomacy.improve-relations
- war.move-ordered
- war.request-peace
- military.set-supply-source
- military.order-garrison`;
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
    tick: number,
  ): void {
    const payload = this.parser.parsePayload(rawResponse);
    if (!payload) return;

    const validation = this.parser.validate(payload, state.getMetadata().currentTick);
    if (!validation.isValid || !validation.validatedPayload) return;

    agent.memory.recordDecision(
      validation.validatedPayload.narrativeSummary ?? validation.validatedPayload.actionType,
      validation.validatedPayload.actionType,
      tick,
    );

    eventBus.publish(
      validation.validatedPayload.actionType,
      validation.validatedPayload.parameters,
      `agent.${agent.countryId}`,
      agent.countryId,
    );
  }

  private buildPrompt(perceptionDump: string, agent: IAgentRecord, tick: number): string {
    const goals = agent.goalManager.getActiveGoals();
    const goalStr = goals.length > 0
      ? goals.slice(0, 3).map((g) => g.description).join('; ')
      : 'Maintain stability and prosperity';

    const recentDecisions = agent.memory.getRecentDecisionRecords(3);
    const historyStr = recentDecisions.length > 0
      ? recentDecisions.map((d) => `  - Tick ${d.tick}: ${d.narrativeSummary}`).join('\n')
      : '  (no prior decisions)';

    return `TICK: ${tick}
ACTIVE GOALS: ${goalStr}

RECENT DECISIONS:
${historyStr}

PERCEIVED WORLD STATE (YAML):
${perceptionDump}

Based on your personality and goals, formulate your strategic decision for this tick.
Return a JSON action payload in a \`\`\`json code block.`;
  }
}
