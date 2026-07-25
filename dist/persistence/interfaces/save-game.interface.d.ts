import { TickNumber } from '../../core/interfaces/event-bus.interface.js';
import { IWorldStateSnapshot, IWorldState } from '../../core/interfaces/world-state.interface.js';
import { ITimelineEntry, ITimeline } from '../../core/interfaces/timeline.interface.js';
import { IEventBus } from '../../core/interfaces/event-bus.interface.js';
import { ITickEngine } from '../../core/interfaces/tick-engine.interface.js';
/**
 * Immutable container for an exported save game.
 */
export interface ISaveGamePayload {
    /** Engine persistence format version. */
    readonly version: string;
    /** ISO 8601 creation timestamp. */
    readonly createdAt: string;
    /** Simulation tick at which the save game was captured (post-flush boundary). */
    readonly tick: TickNumber;
    /** Identifier of the scenario pack. */
    readonly scenarioId: string;
    /** WorldState snapshot data and sub-hash. */
    readonly worldStateSnapshot: IWorldStateSnapshot;
    /** Timeline historical events up to save tick. */
    readonly timelineEntries: ReadonlyArray<ITimelineEntry>;
    /** Global SHA-256 integrity hash for the entire save game file. */
    readonly payloadHash: string;
}
/**
 * Result of rehydrating a save game payload into active simulation components.
 */
export interface IRehydrationResult {
    readonly worldState: IWorldState;
    readonly eventBus: IEventBus;
    readonly timeline: ITimeline;
    readonly tickEngine: ITickEngine;
}
//# sourceMappingURL=save-game.interface.d.ts.map