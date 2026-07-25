import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
export declare const COUP_SYSTEM_ID = "politics.coup";
export declare class CoupSystem implements ISystem {
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
//# sourceMappingURL=coup.system.d.ts.map