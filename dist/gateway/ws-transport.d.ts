import { WebSocketServer } from 'ws';
import { TickBroadcaster } from './broadcaster.js';
import { Server as HttpServer } from 'node:http';
export interface IWsTransportOptions {
    server: HttpServer;
    broadcaster: TickBroadcaster;
}
export declare function attachWsTransport(options: IWsTransportOptions): WebSocketServer;
//# sourceMappingURL=ws-transport.d.ts.map