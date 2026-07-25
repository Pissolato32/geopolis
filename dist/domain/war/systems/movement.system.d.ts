import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
export declare const MOVEMENT_SYSTEM_ID = "war.movement";
export declare class MovementSystem implements ISystem {
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
    private buildProvinceGraph;
    private bfsNextStep;
}
//# sourceMappingURL=movement.system.d.ts.map