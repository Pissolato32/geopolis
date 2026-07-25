import { ISystem, SystemPriority } from '../../core/interfaces/system.interface.js';
import { IWorldState } from '../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../core/interfaces/event-bus.interface.js';
export declare const AGENT_ACTION_SYSTEM_ID = "agent.action-resolver";
export declare class AgentActionSystem implements ISystem {
    readonly descriptor: {
        id: string;
        name: string;
        priority: SystemPriority;
        requiredComponents: never[];
        subscribedEvents: string[];
        emittedEvents: string[];
    };
    initialize(eventBus: IEventBus, worldState?: IWorldState): void;
    execute(_state: Readonly<IWorldState>, _eventBus: IEventBus): void;
}
//# sourceMappingURL=agent-action.system.d.ts.map