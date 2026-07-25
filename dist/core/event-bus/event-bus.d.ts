import { IEventBus, EventHandler, EventId, TickNumber, SubscriptionToken } from '../interfaces/event-bus.interface.js';
import { EntityId } from '../interfaces/entity.interface.js';
import { ITimeline } from '../interfaces/timeline.interface.js';
export interface IEventBusConfig {
    /** Maximum number of cascading events allowed in a single flush cycle (default: 5000). */
    readonly maxEventsPerFlush?: number;
}
export declare class EventBus implements IEventBus {
    private readonly subscribers;
    private readonly wildcardSubscribers;
    private readonly pendingEvents;
    private currentTick;
    private readonly timeline;
    private readonly maxEventsPerFlush;
    constructor(timeline: ITimeline, config?: IEventBusConfig);
    publish<TPayload>(eventType: string, payload: Readonly<TPayload>, sourceSystem: string, entityId?: EntityId): EventId;
    subscribe<TPayload>(eventType: string, handler: EventHandler<TPayload>): SubscriptionToken;
    unsubscribe(token: SubscriptionToken): void;
    unsubscribeAll(eventType: string): void;
    flush(): void;
    setCurrentTick(tick: TickNumber): void;
}
//# sourceMappingURL=event-bus.d.ts.map