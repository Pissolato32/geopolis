import { ITickEngine, ITickEngineConfig, ITickResult, ITickLifecycleHooks } from '../interfaces/tick-engine.interface.js';
import { ISystem } from '../interfaces/system.interface.js';
import { IWorldState } from '../interfaces/world-state.interface.js';
import { IEventBus, TickNumber } from '../interfaces/event-bus.interface.js';
import { ITimeline } from '../interfaces/timeline.interface.js';
/**
 * Concrete Tick Engine implementation — orchestrator of the simulation cycle.
 *
 * Executes registered systems in priority order, flushes the Event Bus,
 * and manages snapshots. Phases 4-5 (Perception + Agent) are extension
 * points for Phase 3 implementation.
 */
export declare class TickEngine implements ITickEngine {
    private readonly config;
    private readonly worldState;
    private readonly eventBus;
    private readonly timeline;
    private systems;
    private currentTick;
    private hooks;
    constructor(worldState: IWorldState, eventBus: IEventBus, timeline: ITimeline, config?: Partial<ITickEngineConfig>);
    getConfig(): Readonly<ITickEngineConfig>;
    registerSystem(system: ISystem): void;
    unregisterSystem(systemId: string): void;
    getRegisteredSystems(): ReadonlyArray<ISystem>;
    tick(): ITickResult;
    runTicks(count: number): ReadonlyArray<ITickResult>;
    getCurrentTick(): TickNumber;
    setCurrentTick(tick: TickNumber): void;
    setLifecycleHooks(hooks: ITickLifecycleHooks): void;
    getWorldState(): IWorldState;
    getEventBus(): IEventBus;
    getTimeline(): ITimeline;
}
//# sourceMappingURL=tick-engine.d.ts.map