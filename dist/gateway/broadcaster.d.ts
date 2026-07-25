import { ITickEngine } from '../core/interfaces/tick-engine.interface.js';
import { IEventBus } from '../core/interfaces/event-bus.interface.js';
import { BroadcastHandler, IBroadcastMessage } from './interfaces/gateway.interface.js';
export declare class TickBroadcaster {
    private readonly subscribers;
    /**
     * Subscribe a callback handler to real-time tick progression and event emissions.
     */
    subscribe(handler: BroadcastHandler): string;
    /**
     * Unsubscribe a broadcaster listener by token.
     */
    unsubscribe(token: string): void;
    /**
     * Attach broadcaster hooks onto active TickEngine and EventBus instances.
     */
    attach(engine: ITickEngine, eventBus: IEventBus): void;
    /**
     * Broadcast message to all connected subscribers.
     */
    broadcast(message: IBroadcastMessage): void;
}
//# sourceMappingURL=broadcaster.d.ts.map