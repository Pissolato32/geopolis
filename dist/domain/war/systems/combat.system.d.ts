import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
export declare const COMBAT_SYSTEM_ID = "war.combat";
export declare class CombatSystem implements ISystem {
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
//# sourceMappingURL=combat.system.d.ts.map