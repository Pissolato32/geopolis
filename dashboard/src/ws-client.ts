import type { StateStore } from './state-store';
import type { WsMessage } from './types';

export class WsClient {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private readonly maxReconnectDelay = 30000;
  private readonly store: StateStore;
  private readonly url: string;
  private readonly onMessage: (msg: WsMessage) => void;
  private destroyed = false;

  constructor(
    url: string,
    store: StateStore,
    onMessage: (msg: WsMessage) => void,
  ) {
    this.url = url;
    this.store = store;
    this.onMessage = onMessage;
    this.connect();
  }

  private connect(): void {
    if (this.destroyed) return;

    this.store.setConnectionStatus('connecting');

    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.store.setConnectionStatus('connected');
    };

    this.ws.onclose = () => {
      this.store.setConnectionStatus('disconnected');
      if (!this.destroyed) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.store.setConnectionStatus('error');
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: WsMessage = JSON.parse(event.data as string);
        this.store.updateTick(msg.tick);
        this.onMessage(msg);
      } catch {
        // ignore malformed messages
      }
    };
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      1000 * 2 ** this.reconnectAttempt,
      this.maxReconnectDelay,
    );
    this.reconnectAttempt++;
    setTimeout(() => this.connect(), delay);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }
}
