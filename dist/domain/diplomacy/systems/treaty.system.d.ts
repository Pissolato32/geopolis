import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
export declare const TREATY_SYSTEM_ID = "diplomacy.treaty";
export declare class TreatySystem implements ISystem {
    readonly descriptor: {
        id: string;
        name: string;
        priority: SystemPriority;
        requiredComponents: string[];
        subscribedEvents: string[];
        emittedEvents: string[];
    };
    initialize(eventBus: IEventBus, worldState?: IWorldState): void;
    execute(_state: Readonly<IWorldState>, _eventBus: IEventBus): void;
}
//# sourceMappingURL=treaty.system.d.ts.map