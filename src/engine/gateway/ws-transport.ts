import { WebSocketServer, WebSocket } from 'ws';
import { TickBroadcaster } from './broadcaster.js';
import { IBroadcastMessage } from './interfaces/gateway.interface.js';
import { IncomingMessage } from 'node:http';
import { Server as HttpServer } from 'node:http';

export interface IWsTransportOptions {
  server: HttpServer;
  broadcaster: TickBroadcaster;
}

export function attachWsTransport(options: IWsTransportOptions): WebSocketServer {
  const wss = new WebSocketServer({ server: options.server });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    const token = options.broadcaster.subscribe((message: IBroadcastMessage) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });

    ws.on('close', () => {
      options.broadcaster.unsubscribe(token);
    });

    ws.on('error', () => {
      options.broadcaster.unsubscribe(token);
    });
  });

  return wss;
}
