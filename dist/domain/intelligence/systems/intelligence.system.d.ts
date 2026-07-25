import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
export declare const INTELLIGENCE_SYSTEM_ID = "intel.system";
/**
 * ECS System responsible for resolving stealth operations and intelligence perception reports per tick.
 * Priority: 600 (executes after war and diplomacy).
 */
export declare class IntelligenceSystem implements ISystem {
    readonly descriptor: {
        id: string;
        name: string;
        priority: SystemPriority;
        requiredComponents: string[];
        subscribedEvents: string[];
        emittedEvents: string[];
    };
    initialize(_eventBus: IEventBus, _worldState?: IWorldState): void;
    execute(state: Readonly<IWorldState>, eventBus: IEventBus): void;
}
//# sourceMappingURL=intelligence.system.d.ts.map