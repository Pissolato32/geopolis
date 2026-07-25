import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
export declare const POLITICS_SYSTEM_ID = "politics.system";
/**
 * ECS System responsible for political stability, faction dynamics, and coup risk per tick.
 * Priority: 300 (executes after economy, reacts to resource shortages via events).
 */
export declare class PoliticsSystem implements ISystem {
    readonly descriptor: {
        id: string;
        name: string;
        priority: SystemPriority;
        requiredComponents: string[];
        subscribedEvents: string[];
        emittedEvents: string[];
    };
    private pendingShortageImpacts;
    initialize(eventBus: IEventBus, worldState?: IWorldState): void;
    execute(state: Readonly<IWorldState>, eventBus: IEventBus): void;
}
//# sourceMappingURL=politics.system.d.ts.map