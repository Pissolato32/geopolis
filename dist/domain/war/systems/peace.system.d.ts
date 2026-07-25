import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
export declare const PEACE_SYSTEM_ID = "war.peace";
export declare class PeaceSystem implements ISystem {
    readonly descriptor: {
        id: string;
        name: string;
        priority: SystemPriority;
        requiredComponents: never[];
        subscribedEvents: string[];
        emittedEvents: string[];
    };
    initialize(eventBus: IEventBus, worldState?: IWorldState): void;
    execute(): void;
    private processPeaceRequest;
    private evaluateAcceptance;
    private transferProvinceTo;
    private updateBilateralRelations;
}
//# sourceMappingURL=peace.system.d.ts.map