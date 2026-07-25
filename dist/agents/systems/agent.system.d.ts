import { ISystem, SystemPriority } from '../../core/interfaces/system.interface.js';
import { IWorldState } from '../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../core/interfaces/event-bus.interface.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';
import { AgentMemory, IAgentPersonality } from '../memory/agent-memory.js';
import { ILlmProvider } from '../llm/llm-provider.interface.js';
export declare const AGENT_SYSTEM_ID = "agent.evaluator";
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
export declare class AgentSystem implements ISystem {
    readonly descriptor: {
        id: string;
        name: string;
        priority: SystemPriority;
        requiredComponents: never[];
        subscribedEvents: never[];
        emittedEvents: never[];
    };
    private readonly agents;
    private readonly parser;
    private readonly provider;
    private readonly evaluator;
    private readonly personality;
    constructor(config?: IAgentSystemConfig);
    discoverAgents(state: Readonly<IWorldState>): void;
    getAgentCount(): number;
    getAgents(): ReadonlyArray<IAgentRecord>;
    execute(state: Readonly<IWorldState>, eventBus: IEventBus): void;
    private collectHeuristicContext;
    private processResponse;
    private buildPrompt;
}
export {};
//# sourceMappingURL=agent.system.d.ts.map