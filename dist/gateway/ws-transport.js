import { WebSocketServer, WebSocket } from 'ws';
export function attachWsTransport(options) {
    const wss = new WebSocketServer({ server: options.server });
    wss.on('connection', (ws, _req) => {
        const token = options.broadcaster.subscribe((message) => {
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
//# sourceMappingURL=ws-transport.js.map