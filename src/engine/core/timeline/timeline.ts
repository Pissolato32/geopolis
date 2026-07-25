import { ITimeline, ITimelineEntry, ITimelineQuery } from '../interfaces/timeline.interface.js';
import { ISimulationEvent, TickNumber, EventId } from '../interfaces/event-bus.interface.js';
import { createHash } from 'node:crypto';
import { bigintJsonReplacer } from '../utils/bigint-json.js';

/**
 * Concrete Timeline implementation — append-only event ledger.
 *
 * Events are never modified or deleted after recording. All queries
 * return readonly views of the data.
 */
export class Timeline implements ITimeline {
  private readonly entries: ITimelineEntry[] = [];
  private readonly indexById: Map<EventId, ITimelineEntry> = new Map();
  private sequenceCounter = 0;
  private currentTick: TickNumber | undefined;
  private readonly checkpoints: Map<string, { tick: TickNumber; entryCount: number }> = new Map();

  record(event: ISimulationEvent): ITimelineEntry {
    // Reset sequence counter when tick changes
    if (this.currentTick !== event.tick) {
      this.currentTick = event.tick;
      this.sequenceCounter = 0;
    }

    const payloadHash = this.computeHash(event);
    const entry: ITimelineEntry = {
      event,
      sequenceId: this.sequenceCounter++,
      payloadHash,
    };

    this.entries.push(entry);
    this.indexById.set(event.id, entry);

    return entry;
  }

  query(query: ITimelineQuery): ReadonlyArray<ITimelineEntry> {
    let results: ITimelineEntry[] = this.entries;

    if (query.fromTick !== undefined) {
      results = results.filter((e) => e.event.tick >= query.fromTick!);
    }
    if (query.toTick !== undefined) {
      results = results.filter((e) => e.event.tick <= query.toTick!);
    }
    if (query.eventType !== undefined) {
      results = results.filter((e) => e.event.type === query.eventType);
    }
    if (query.sourceSystem !== undefined) {
      results = results.filter((e) => e.event.sourceSystem === query.sourceSystem);
    }
    if (query.entityId !== undefined) {
      results = results.filter((e) => e.event.entityId === query.entityId);
    }
    if (query.offset !== undefined) {
      results = results.slice(query.offset);
    }
    if (query.limit !== undefined) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  getById(eventId: EventId): ITimelineEntry | undefined {
    return this.indexById.get(eventId);
  }

  getEventCount(): number {
    return this.entries.length;
  }

  getLatestTick(): TickNumber | undefined {
    if (this.entries.length === 0) return undefined;
    return this.entries[this.entries.length - 1]!.event.tick;
  }

  createCheckpoint(tick: TickNumber): string {
    const checkpointId = `checkpoint-${tick}-${Date.now()}`;
    this.checkpoints.set(checkpointId, {
      tick,
      entryCount: this.entries.length,
    });
    return checkpointId;
  }

  private computeHash(event: ISimulationEvent): string {
    const content = JSON.stringify(
      {
        type: event.type,
        tick: event.tick,
        sourceSystem: event.sourceSystem,
        entityId: event.entityId,
        // Include payload if present (ITypedEvent)
        ...('payload' in event ? { payload: (event as Record<string, unknown>)['payload'] } : {}),
      },
      bigintJsonReplacer,
    );
    return createHash('sha256').update(content).digest('hex');
  }
}
