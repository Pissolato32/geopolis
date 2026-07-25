import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
export declare const ECONOMY_SYSTEM_ID = "economy.system";
/**
 * ECS System responsible for economic simulation per tick.
 * Priority: 200 (runs after resource extraction, before politics/diplomacy).
 */
export declare class EconomySystem implements ISystem {
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
//# sourceMappingURL=economy.system.d.ts.map