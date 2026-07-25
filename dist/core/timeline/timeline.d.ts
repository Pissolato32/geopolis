import { ITimeline, ITimelineEntry, ITimelineQuery } from '../interfaces/timeline.interface.js';
import { ISimulationEvent, TickNumber, EventId } from '../interfaces/event-bus.interface.js';
/**
 * Concrete Timeline implementation — append-only event ledger.
 *
 * Events are never modified or deleted after recording. All queries
 * return readonly views of the data.
 */
export declare class Timeline implements ITimeline {
    private readonly entries;
    private readonly indexById;
    private sequenceCounter;
    private currentTick;
    private readonly checkpoints;
    record(event: ISimulationEvent): ITimelineEntry;
    query(query: ITimelineQuery): ReadonlyArray<ITimelineEntry>;
    getById(eventId: EventId): ITimelineEntry | undefined;
    getEventCount(): number;
    getLatestTick(): TickNumber | undefined;
    createCheckpoint(tick: TickNumber): string;
    private computeHash;
}
//# sourceMappingURL=timeline.d.ts.map