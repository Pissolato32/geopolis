/**
 * @module core/interfaces/event-bus
 * @description Contract for the typed Event Bus — the sole communication
 * channel between all ECS Systems.
 *
 * No system may call another system directly. All inter-system communication
 * flows through this bus. Every event is immutable, typed, and auditable.
 */
import { EntityId } from './entity.interface.js';
/** Monotonically increasing tick counter. */
export type TickNumber = number & {
    readonly __brand: unique symbol;
};
/** Unique identifier for an event instance in the Timeline. */
export type EventId = string & {
    readonly __brand: unique symbol;
};
/**
 * Base interface for all simulation events.
 * Events are immutable once published. They represent facts that have occurred.
 */
export interface ISimulationEvent {
    /** Unique event identifier, assigned by the Event Bus upon publication. */
    readonly id: EventId;
    /** Fully qualified event type name (e.g., "economy.gdp-updated"). */
    readonly type: string;
    /** The tick during which this event was emitted. */
    readonly tick: TickNumber;
    /** Identifier of the system that emitted this event. */
    readonly sourceSystem: string;
    /** Optional entity that this event pertains to. */
    readonly entityId?: EntityId;
    /** ISO 8601 timestamp of emission (wall-clock, for debugging only). */
    readonly timestamp: string;
}
/**
 * A typed simulation event carrying a domain-specific payload.
 * @typeParam TPayload - The strict payload shape for this event type.
 */
export interface ITypedEvent<TPayload> extends ISimulationEvent {
    /** The immutable, typed event payload. */
    readonly payload: Readonly<TPayload>;
}
/**
 * Callback signature for event subscribers.
 * @typeParam TPayload - The expected payload shape.
 */
export type EventHandler<TPayload> = (event: ITypedEvent<TPayload>) => void;
/** Token returned by `subscribe()` to enable targeted unsubscription. */
export type SubscriptionToken = string & {
    readonly __brand: unique symbol;
};
/**
 * The Event Bus contract — typed Pub/Sub backbone of the engine.
 *
 * @remarks
 * - Events published within a tick are processed in emission order.
 * - All events are forwarded to the Timeline for permanent recording.
 * - Subscribers receive events by type, never by source system (enforces decoupling).
 */
export interface IEventBus {
    /**
     * Publish a typed event to all subscribers of the given event type.
     *
     * @typeParam TPayload - The payload type.
     * @param eventType - The fully qualified event type string.
     * @param payload - The immutable event data.
     * @param sourceSystem - Identifier of the emitting system.
     * @param entityId - Optional entity this event pertains to.
     * @returns The assigned EventId.
     */
    publish<TPayload>(eventType: string, payload: Readonly<TPayload>, sourceSystem: string, entityId?: EntityId): EventId;
    /**
     * Subscribe a handler to a specific event type.
     *
     * @typeParam TPayload - The expected payload type.
     * @param eventType - The event type to listen for.
     * @param handler - The callback invoked when matching events are published.
     * @returns A token for unsubscription.
     */
    subscribe<TPayload>(eventType: string, handler: EventHandler<TPayload>): SubscriptionToken;
    /**
     * Remove a previously registered subscription.
     * @param token - The subscription token returned by `subscribe()`.
     */
    unsubscribe(token: SubscriptionToken): void;
    /**
     * Remove all subscriptions for a given event type.
     * Primarily used during teardown or testing.
     * @param eventType - The event type whose subscriptions should be cleared.
     */
    unsubscribeAll(eventType: string): void;
    /**
     * Process all pending events in the current tick's queue.
     * Called by the Tick Engine during the Event Resolution phase.
     * Events are delivered to subscribers in emission order.
     */
    flush(): void;
    /**
     * Set the current tick number for event metadata.
     * Called by the Tick Engine at the start of each tick.
     * @param tick - The current tick number.
     */
    setCurrentTick(tick: TickNumber): void;
}
//# sourceMappingURL=event-bus.interface.d.ts.map