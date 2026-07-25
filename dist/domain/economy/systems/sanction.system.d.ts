import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
export declare const SANCTION_SYSTEM_ID = "economy.sanction";
export declare class SanctionSystem implements ISystem {
    readonly descriptor: {
        id: string;
        name: string;
        priority: SystemPriority;
        requiredComponents: string[];
        subscribedEvents: never[];
        emittedEvents: string[];
    };
    execute(state: Readonly<IWorldState>, eventBus: IEventBus): void;
}
//# sourceMappingURL=sanction.system.d.ts.map