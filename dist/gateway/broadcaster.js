import { randomUUID } from 'node:crypto';
export class TickBroadcaster {
    subscribers = new Map();
    /**
     * Subscribe a callback handler to real-time tick progression and event emissions.
     */
    subscribe(handler) {
        const token = randomUUID();
        this.subscribers.set(token, handler);
        return token;
    }
    /**
     * Unsubscribe a broadcaster listener by token.
     */
    unsubscribe(token) {
        this.subscribers.delete(token);
    }
    /**
     * Attach broadcaster hooks onto active TickEngine and EventBus instances.
     */
    attach(engine, eventBus) {
        engine.setLifecycleHooks({
            onTickEnd: (result) => {
                this.broadcast({
                    type: 'tick_completed',
                    tick: result.tick,
                    payload: result,
                    timestamp: new Date().toISOString(),
                });
            },
        });
        eventBus.subscribe('*', (event) => {
            this.broadcast({
                type: 'event_emitted',
                tick: event.tick,
                payload: event,
                timestamp: event.timestamp,
            });
        });
    }
    /**
     * Broadcast message to all connected subscribers.
     */
    broadcast(message) {
        for (const handler of this.subscribers.values()) {
            try {
                handler(message);
            }
            catch {
                // Suppress subscriber handler exceptions to keep engine safe
            }
        }
    }
}
//# sourceMappingURL=broadcaster.js.map