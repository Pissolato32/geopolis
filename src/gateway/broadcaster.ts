import { ITickEngine } from '../core/interfaces/tick-engine.interface.js';
import { IEventBus } from '../core/interfaces/event-bus.interface.js';
import { BroadcastHandler, IBroadcastMessage } from './interfaces/gateway.interface.js';
import { randomUUID } from 'node:crypto';

export class TickBroadcaster {
  private readonly subscribers: Map<string, BroadcastHandler> = new Map();

  /**
   * Subscribe a callback handler to real-time tick progression and event emissions.
   */
  public subscribe(handler: BroadcastHandler): string {
    const token = randomUUID();
    this.subscribers.set(token, handler);
    return token;
  }

  /**
   * Unsubscribe a broadcaster listener by token.
   */
  public unsubscribe(token: string): void {
    this.subscribers.delete(token);
  }

  /**
   * Attach broadcaster hooks onto active TickEngine and EventBus instances.
   */
  public attach(engine: ITickEngine, eventBus: IEventBus): void {
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
  public broadcast(message: IBroadcastMessage): void {
    for (const handler of this.subscribers.values()) {
      try {
        handler(message);
      } catch {
        // Suppress subscriber handler exceptions to keep engine safe
      }
    }
  }
}
