import { EntityId } from '../../core/interfaces/entity.interface.js';
import { IWorldState } from '../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../core/interfaces/event-bus.interface.js';
import { AgentMemory, IAgentPersonality } from '../memory/agent-memory.js';
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
export declare class AgentController {
    readonly countryId: EntityId;
    readonly memory: AgentMemory;
    private readonly parser;
    private readonly llmEvaluator?;
    constructor(config: IAgentControllerConfig);
    /**
     * Execute an agent decision cycle for the current tick under Fog of War.
     */
    evaluateTick(worldState: Readonly<IWorldState>, eventBus: IEventBus): Promise<boolean>;
    private buildPrompt;
    private generateDefaultAction;
}
//# sourceMappingURL=agent-controller.d.ts.map