import { IWorldState } from '../core/interfaces/world-state.interface.js';
import { IEventBus } from '../core/interfaces/event-bus.interface.js';
import { ISystem, SystemPriority } from '../core/interfaces/system.interface.js';
export interface IAchievementDef {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly check: (state: Readonly<IWorldState>) => boolean;
}
export declare class AchievementManager implements ISystem {
    readonly descriptor: {
        id: string;
        name: string;
        priority: SystemPriority;
        requiredComponents: never[];
        subscribedEvents: never[];
        emittedEvents: string[];
    };
    private readonly unlocked;
    private readonly defs;
    constructor(defs?: ReadonlyArray<IAchievementDef>);
    unlockFromFrontend(id: string): void;
    execute(state: Readonly<IWorldState>, eventBus: IEventBus): void;
}
//# sourceMappingURL=achievement-manager.d.ts.map