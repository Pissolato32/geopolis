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
import { ECONOMIC_INDICATOR_TYPE, RESOURCE_PRODUCTION_TYPE, EconomicIndicatorComponent } from '../../domain/economy/components/economy.components.js';
import { GOVERNMENT_STABILITY_TYPE } from '../../domain/politics/components/politics.components.js';
import { DIPLOMATIC_RELATION_TYPE } from '../../domain/diplomacy/components/relation.component.js';
import { INTELLIGENCE_AGENCY_TYPE, IntelligenceAgencyComponent } from '../../domain/intelligence/components/intelligence.components.js';
import { IDoctrine, DoctrineType, DOCTRINES, assignDoctrinesByGdp } from '../doctrines.js';

export const AGENT_SYSTEM_ID = 'agent.evaluator';

interface IAgentRecord {
  countryId: EntityId;
  memory: AgentMemory;
  goalManager: GoalManager;
  doctrine: IDoctrine | undefined;
}

export interface IAgentSystemConfig {
  readonly provider?: ILlmProvider;
  readonly evaluator?: (prompt: string, systemPrompt?: string) => string;
  readonly controlledEntities?: ReadonlyArray<EntityId>;
  readonly personality?: Partial<IAgentPersonality>;
  readonly memoryStore?: IAgentMemoryStore;
  /** Intel level for perception filter (0.0-1.0). Lower = more fog-of-war distortion. */
  readonly defaultIntelLevel?: number;
  /** Manual doctrine assignments. If not provided, doctrines are auto-assigned by GDP. */
  readonly doctrineAssignments?: Map<EntityId, DoctrineType>;
}

export class AgentSystem implements ISystem {
  readonly descriptor = {
    id: AGENT_SYSTEM_ID,
    name: 'Agent Evaluator System',
    priority: 40 as SystemPriority,
    requiredComponents: [],
    subscribedEvents: [
      'economy.sanction-imposed',
      'diplomacy.treaty-signed',
      'diplomacy.treaty-broken',
      'war.declared',
    ],
    emittedEvents: [],
  };

  private readonly agents: IAgentRecord[] = [];
  private readonly parser = new StrictIntentParser();
  private readonly provider: ILlmProvider | undefined;
  private readonly evaluator: ((prompt: string, systemPrompt?: string) => string) | undefined;
  private readonly personality: Partial<IAgentPersonality> | undefined;
  private readonly memoryStore: IAgentMemoryStore;
  private readonly defaultIntelLevel: number;
  private readonly manualDoctrines: Map<EntityId, DoctrineType> | undefined;
  private doctrineAssignments: Map<EntityId, DoctrineType> | undefined;

  constructor(config: IAgentSystemConfig = {}) {
    this.provider = config.provider;
    this.evaluator = config.evaluator;
    this.personality = config.personality;
    this.memoryStore = config.memoryStore ?? new InMemoryAgentMemoryStore();
    this.defaultIntelLevel = config.defaultIntelLevel ?? 1.0;
    this.manualDoctrines = config.doctrineAssignments;

    if (config.controlledEntities) {
      for (const id of config.controlledEntities) {
        this.registerAgent(id);
      }
    }
  }

  private registerAgent(id: EntityId, doctrine?: IDoctrine): IAgentRecord {
    const fullPersonality: IAgentPersonality = {
      aggressiveness: doctrine?.personality.aggressiveness ?? this.personality?.aggressiveness ?? 0.5,
      riskTolerance: doctrine?.personality.riskTolerance ?? this.personality?.riskTolerance ?? 0.5,
      trustPropensity: doctrine?.personality.trustPropensity ?? this.personality?.trustPropensity ?? 0.5,
    };
    const memory = new AgentMemory(id, this.personality, this.memoryStore);
    const goalManager = new GoalManager(id, fullPersonality);

    if (doctrine) {
      for (const goal of doctrine.goals) {
        goalManager.addGoal({
          goalId: `${id}-doctrine-goal-${goal.priority}`,
          description: goal.description,
          priority: goal.priority,
        }, 0);
      }
    }

    const record: IAgentRecord = { countryId: id, memory, goalManager, doctrine };
    this.agents.push(record);
    return record;
  }

  initialize(eventBus: IEventBus, _worldState?: IWorldState): void {
    this.bindGrievanceListeners(eventBus);
  }

  private bindGrievanceListeners(eventBus: IEventBus): void {
    eventBus.subscribe('economy.sanction-imposed', (event) => {
      const payload = event.payload as Record<string, unknown> | undefined;
      const targetId = payload?.['targetCountryId'] as EntityId | undefined;
      const sourceId = payload?.['sourceCountryId'] as EntityId | undefined;
      if (!targetId || !sourceId) return;
      const agent = this.agents.find((a) => a.countryId === targetId);
      if (!agent) return;
      agent.memory.recordGrievance(
        sourceId,
        'active-sanction',
        `Sanction imposed by ${sourceId}: ${payload?.['sanctionType'] ?? 'unknown'}`,
        event.tick ?? 0,
        0.6,
      );
    });

    eventBus.subscribe('war.declared', (event) => {
      const payload = event.payload as Record<string, unknown> | undefined;
      const targetId = payload?.['targetId'] as EntityId | undefined;
      const aggressorId = payload?.['aggressorId'] as EntityId | undefined;
      if (!targetId || !aggressorId) return;
      const agent = this.agents.find((a) => a.countryId === targetId);
      if (!agent) return;
      agent.memory.recordGrievance(
        aggressorId,
        'unprovoked-threat',
        `War declared by ${aggressorId}: ${payload?.['reason'] ?? 'unprovoked aggression'}`,
        (payload?.['tick'] as number) ?? 0,
        0.8,
      );
    });
  }

  discoverAgents(state: Readonly<IWorldState>): void {
    const existing = new Set(this.agents.map((a) => a.countryId));
    const countries = state.getEntitiesByComponent(ECONOMIC_INDICATOR_TYPE);

    // Auto-assign doctrines by GDP if not manually set
    if (!this.doctrineAssignments) {
      if (this.manualDoctrines) {
        this.doctrineAssignments = this.manualDoctrines;
      } else {
        const gdpRanking = new Map<EntityId, number>();
        for (const entity of countries) {
          const econ = entity.getComponent(ECONOMIC_INDICATOR_TYPE) as EconomicIndicatorComponent | undefined;
          if (econ) {
            gdpRanking.set(entity.id, Number(econ.gdp));
          }
        }
        this.doctrineAssignments = assignDoctrinesByGdp(
          [...countries.map((c) => c.id)],
          gdpRanking,
        );
      }
    }

    for (const entity of countries) {
      if (!existing.has(entity.id)) {
        const doctrineType = this.doctrineAssignments.get(entity.id);
        const doctrine = doctrineType ? DOCTRINES[doctrineType] : undefined;
        if (doctrineType && doctrine) {
          this.registerAgent(entity.id, doctrine);
        } else {
          this.registerAgent(entity.id);
        }
        existing.add(entity.id);
      }
    }
  }

  /** Get the doctrine assigned to a country. */
  getDoctrineForCountry(countryId: EntityId): IDoctrine | undefined {
    const agent = this.agents.find((a) => a.countryId === countryId);
    return agent?.doctrine;
  }

  /** Get all doctrine assignments. */
  getDoctrineAssignments(): ReadonlyMap<EntityId, DoctrineType> | undefined {
    return this.doctrineAssignments;
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

    const doctrineSection = agent.doctrine
      ? `GEOPOLITICAL DOCTRINE: ${agent.doctrine.name}\n${agent.doctrine.description}\n\nPreferred actions: ${agent.doctrine.preferredActions.join(', ')}\nAvoid: ${agent.doctrine.avoidedActions.join(', ')}\n`
      : '';

    const grievanceSummary = agent.memory.getGrievanceSummary();

    return `You are the autonomous political leader of ${agent.countryId}.
${agent.memory.getPersonalityProfile()}

${doctrineSection}
ACTIVE STRATEGIC GOALS (priority order):
${goalList}

${grievanceSummary}

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
- military.order-garrison
- resolve-cabinet-card
- intelligence.gather`;
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

    const grievanceSummary = agent.memory.getGrievanceSummary();

    return `TICK: ${tick}
ACTIVE GOALS: ${goalStr}

RECENT DECISIONS:
${historyStr}

${grievanceSummary}

PERCEIVED WORLD STATE (YAML):
${perceptionDump}

Based on your personality, doctrine, and historical grievances, formulate your strategic decision for this tick.
Return a JSON action payload in a \`\`\`json code block.`;
  }
}
