import { ISystem, SystemPriority } from '../core/interfaces/system.interface.js';
import { IWorldState } from '../core/interfaces/world-state.interface.js';
import { IEventBus } from '../core/interfaces/event-bus.interface.js';
import { IScenarioEventTrigger } from './scenario.types.js';
export declare const SCENARIO_TRIGGER_SYSTEM_ID = "scenario.trigger-system";
export declare class ScenarioTriggerSystem implements ISystem {
    readonly descriptor: {
        id: string;
        name: string;
        priority: SystemPriority;
        requiredComponents: never[];
        subscribedEvents: never[];
        emittedEvents: never[];
    };
    private readonly triggers;
    private nextIndex;
    constructor(triggers: ReadonlyArray<IScenarioEventTrigger>);
    initialize(): void;
    execute(worldState: Readonly<IWorldState>, eventBus: IEventBus): void;
    teardown(): void;
}
//# sourceMappingURL=scenario.trigger-system.d.ts.map