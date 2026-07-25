import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
export declare const DIPLOMACY_SYSTEM_ID = "diplomacy.system";
/**
 * ECS System responsible for resolving inter-state relation graphs per tick.
 * Priority: 400 (executes after politics, resolves relation graph dynamics).
 */
export declare class DiplomacySystem implements ISystem {
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
//# sourceMappingURL=diplomacy.system.d.ts.map