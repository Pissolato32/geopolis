import {
  IEventBus,
  ITypedEvent,
  EventHandler,
  EventId,
  TickNumber,
  SubscriptionToken,
} from '../interfaces/event-bus.interface.js';
import { EntityId } from '../interfaces/entity.interface.js';
import { ITimeline } from '../interfaces/timeline.interface.js';
import { randomUUID } from '../utils/crypto-polyfill.js';

interface Subscription<TPayload = unknown> {
  readonly token: SubscriptionToken;
  readonly handler: EventHandler<TPayload>;
}

export interface IEventBusConfig {
  /** Maximum number of cascading events allowed in a single flush cycle (default: 5000). */
  readonly maxEventsPerFlush?: number;
}

/**
 * Concrete Event Bus implementation — typed Pub/Sub with queue-based flush.
 *
 * Events published during system execution are buffered in a pending queue.
 * They are only delivered to subscribers and recorded in the Timeline when
 * flush() is called by the Tick Engine during the Event Resolution phase.
 */
const WILDCARD = '*';

export class EventBus implements IEventBus {
  private readonly subscribers: Map<string, Subscription[]> = new Map();
  private readonly wildcardSubscribers: Subscription[] = [];
  private pendingEvents: ITypedEvent<unknown>[] = [];
  private currentTick: TickNumber = 0 as TickNumber;
  private readonly timeline: ITimeline;
  private readonly maxEventsPerFlush: number;

  constructor(timeline: ITimeline, config: IEventBusConfig = {}) {
    this.timeline = timeline;
    this.maxEventsPerFlush = config.maxEventsPerFlush ?? 5000;
  }

  publish<TPayload>(
    eventType: string,
    payload: Readonly<TPayload>,
    sourceSystem: string,
    entityId?: EntityId,
  ): EventId {
    const id = randomUUID() as EventId;

    const event: ITypedEvent<TPayload> = {
      id,
      type: eventType,
      tick: this.currentTick,
      sourceSystem,
      ...(entityId !== undefined ? { entityId } : {}),
      timestamp: new Date().toISOString(),
      payload,
    };

    this.pendingEvents.push(event as ITypedEvent<unknown>);
    return id;
  }

  subscribe<TPayload>(
    eventType: string,
    handler: EventHandler<TPayload>,
  ): SubscriptionToken {
    const token = randomUUID() as SubscriptionToken;
    const subscription: Subscription<TPayload> = { token, handler };

    if (eventType === WILDCARD) {
      this.wildcardSubscribers.push(subscription as Subscription);
      return token;
    }

    const existing = this.subscribers.get(eventType);
    if (existing) {
      existing.push(subscription as Subscription);
    } else {
      this.subscribers.set(eventType, [subscription as Subscription]);
    }

    return token;
  }

  unsubscribe(token: SubscriptionToken): void {
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

  unsubscribeAll(eventType: string): void {
    if (eventType === WILDCARD) {
      this.wildcardSubscribers.length = 0;
      return;
    }
    this.subscribers.delete(eventType);
  }

  flush(): void {
    if (this.pendingEvents.length === 0) return;

    let processedCount = 0;
    const eventTrail: string[] = [];
    let index = 0;

    // Index-based drain — O(N) instead of O(N^2) from shift().
    // Events published by handlers during iteration are appended to
    // pendingEvents and picked up by the while condition, preserving
    // cascade behavior. The queue is cleared once after all processing.
    while (index < this.pendingEvents.length) {
      if (processedCount >= this.maxEventsPerFlush) {
        throw new Error(
          `EventBus cascade loop limit exceeded! Processed ${processedCount} events in a single flush cycle. Event trail sample: ${eventTrail.slice(-5).join(' -> ')}`,
        );
      }

      const event = this.pendingEvents[index]!;
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

      index++;
    }

    this.pendingEvents = [];
  }

  setCurrentTick(tick: TickNumber): void {
    this.currentTick = tick;
  }
}
