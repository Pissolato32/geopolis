import { randomUUID } from 'node:crypto';
/**
 * Concrete Event Bus implementation — typed Pub/Sub with queue-based flush.
 *
 * Events published during system execution are buffered in a pending queue.
 * They are only delivered to subscribers and recorded in the Timeline when
 * flush() is called by the Tick Engine during the Event Resolution phase.
 */
const WILDCARD = '*';
export class EventBus {
    subscribers = new Map();
    wildcardSubscribers = [];
    pendingEvents = [];
    currentTick = 0;
    timeline;
    maxEventsPerFlush;
    constructor(timeline, config = {}) {
        this.timeline = timeline;
        this.maxEventsPerFlush = config.maxEventsPerFlush ?? 5000;
    }
    publish(eventType, payload, sourceSystem, entityId) {
        const id = randomUUID();
        const event = {
            id,
            type: eventType,
            tick: this.currentTick,
            sourceSystem,
            ...(entityId !== undefined ? { entityId } : {}),
            timestamp: new Date().toISOString(),
            payload,
        };
        this.pendingEvents.push(event);
        return id;
    }
    subscribe(eventType, handler) {
        const token = randomUUID();
        const subscription = { token, handler };
        if (eventType === WILDCARD) {
            this.wildcardSubscribers.push(subscription);
            return token;
        }
        const existing = this.subscribers.get(eventType);
        if (existing) {
            existing.push(subscription);
        }
        else {
            this.subscribers.set(eventType, [subscription]);
        }
        return token;
    }
    unsubscribe(token) {
        const wildcardIndex = this.wildcardSubscribers.findIndex((s) => s.token === token);
        if (wildcardIndex !== -1) {
            this.wildcardSubscribers.splice(wildcardIndex, 1);
            return;
        }
        for (const [eventType, subs] of this.subscribers) {
            const index = subs.findIndex((s) => s.token === token);
            if (index !== -1) {
                subs.splice(index, 1);
                if (subs.length === 0) {
                    this.subscribers.delete(eventType);
                }
                return;
            }
        }
    }
    unsubscribeAll(eventType) {
        if (eventType === WILDCARD) {
            this.wildcardSubscribers.length = 0;
            return;
        }
        this.subscribers.delete(eventType);
    }
    flush() {
        let processedCount = 0;
        const eventTrail = [];
        // Drain the queue — process events in FIFO (emission) order.
        // Includes maxEventsPerFlush guard to prevent infinite event cascade loops (Fail Fast).
        while (this.pendingEvents.length > 0) {
            if (processedCount >= this.maxEventsPerFlush) {
                throw new Error(`EventBus cascade loop limit exceeded! Processed ${processedCount} events in a single flush cycle. Event trail sample: ${eventTrail.slice(-5).join(' -> ')}`);
            }
            const event = this.pendingEvents.shift();
            processedCount++;
            eventTrail.push(event.type);
            // Record in Timeline (permanent, append-only)
            this.timeline.record(event);
            // Deliver to type-specific subscribers
            const subs = this.subscribers.get(event.type);
            if (subs) {
                for (const sub of [...subs]) {
                    sub.handler(event);
                }
            }
            // Deliver to wildcard subscribers
            if (this.wildcardSubscribers.length > 0) {
                for (const sub of [...this.wildcardSubscribers]) {
                    sub.handler(event);
                }
            }
        }
    }
    setCurrentTick(tick) {
        this.currentTick = tick;
    }
}
//# sourceMappingURL=event-bus.js.map