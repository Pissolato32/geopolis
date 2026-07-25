import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
export declare const WAR_SYSTEM_ID = "war.system";
/**
 * ECS System responsible for military unit maintenance, fuel consumption, and combat readiness per tick.
 * Priority: 500 (executes after diplomacy).
 */
export declare class WarSystem implements ISystem {
    readonly descriptor: {
        id: string;
        name: string;
        priority: SystemPriority;
        requiredComponents: string[];
        subscribedEvents: string[];
        emittedEvents: string[];
    };
    initialize(eventBus: IEventBus, worldState?: IWorldState): void;
    execute(state: Readonly<IWorldState>, eventBus: IEventBus): void;
}
//# sourceMappingURL=war.system.d.ts.map