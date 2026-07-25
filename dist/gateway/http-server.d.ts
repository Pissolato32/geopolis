import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { APIGatewayRouter } from './gateway-router.js';
export interface IHttpServerOptions {
    host: string;
    port: number;
    router: APIGatewayRouter;
    staticDir?: string;
}
export declare function handleHttpRequest(router: APIGatewayRouter, req: IncomingMessage, res: ServerResponse, staticDir?: string): Promise<void>;
export declare function createHttpServer(router: APIGatewayRouter, staticDir?: string): ReturnType<typeof createServer>;
export declare function startHttpServer(options: IHttpServerOptions): Promise<ReturnType<typeof createServer>>;
//# sourceMappingURL=http-server.d.ts.map