import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
export declare const PROVINCE_COMBAT_SYSTEM_ID = "war.province-combat";
export declare class ProvinceCombatSystem implements ISystem {
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
    private groupByCountry;
    private applyCasualties;
}
//# sourceMappingURL=province-combat.system.d.ts.map