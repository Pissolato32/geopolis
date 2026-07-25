import { createHash } from 'node:crypto';
import { bigintJsonReplacer } from '../utils/bigint-json.js';
/**
 * Concrete Timeline implementation — append-only event ledger.
 *
 * Events are never modified or deleted after recording. All queries
 * return readonly views of the data.
 */
export class Timeline {
    entries = [];
    indexById = new Map();
    sequenceCounter = 0;
    currentTick;
    checkpoints = new Map();
    record(event) {
        // Reset sequence counter when tick changes
        if (this.currentTick !== event.tick) {
            this.currentTick = event.tick;
            this.sequenceCounter = 0;
        }
        const payloadHash = this.computeHash(event);
        const entry = {
            event,
            sequenceId: this.sequenceCounter++,
            payloadHash,
        };
        this.entries.push(entry);
        this.indexById.set(event.id, entry);
        return entry;
    }
    query(query) {
        let results = this.entries;
        if (query.fromTick !== undefined) {
            results = results.filter((e) => e.event.tick >= query.fromTick);
        }
        if (query.toTick !== undefined) {
            results = results.filter((e) => e.event.tick <= query.toTick);
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
    getById(eventId) {
        return this.indexById.get(eventId);
    }
    getEventCount() {
        return this.entries.length;
    }
    getLatestTick() {
        if (this.entries.length === 0)
            return undefined;
        return this.entries[this.entries.length - 1].event.tick;
    }
    createCheckpoint(tick) {
        const checkpointId = `checkpoint-${tick}-${Date.now()}`;
        this.checkpoints.set(checkpointId, {
            tick,
            entryCount: this.entries.length,
        });
        return checkpointId;
    }
    computeHash(event) {
        const content = JSON.stringify({
            type: event.type,
            tick: event.tick,
            sourceSystem: event.sourceSystem,
            entityId: event.entityId,
            // Include payload if present (ITypedEvent)
            ...('payload' in event ? { payload: event['payload'] } : {}),
        }, bigintJsonReplacer);
        return createHash('sha256').update(content).digest('hex');
    }
}
//# sourceMappingURL=timeline.js.map