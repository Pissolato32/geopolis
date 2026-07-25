import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
            try {
                const raw = Buffer.concat(chunks).toString('utf-8');
                resolve(raw ? JSON.parse(raw) : undefined);
            }
            catch (err) {
                reject(err);
            }
        });
        req.on('error', reject);
    });
}
function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}
function serveStatic(res, filePath) {
    if (!existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
    }
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    const content = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
}
export async function handleHttpRequest(router, req, res, staticDir) {
    try {
        const urlPath = req.url?.split('?')[0] ?? '/';
        if (urlPath.startsWith('/api/')) {
            const method = req.method === 'GET' ? 'GET' : 'POST';
            const payload = method === 'POST' ? await readBody(req) : undefined;
            const gatewayReq = { path: urlPath, method, payload };
            const gatewayRes = await router.dispatch(gatewayReq);
            sendJson(res, gatewayRes.statusCode, gatewayRes);
            return;
        }
        if (staticDir) {
            const filePath = resolve(staticDir, urlPath === '/' ? 'index.html' : urlPath.slice(1));
            if (existsSync(filePath)) {
                serveStatic(res, filePath);
                return;
            }
            const indexPath = resolve(staticDir, 'index.html');
            if (existsSync(indexPath)) {
                serveStatic(res, indexPath);
                return;
            }
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
    catch (err) {
        sendJson(res, 500, {
            statusCode: 500,
            success: false,
            error: err instanceof Error ? err.message : 'Internal Server Error',
        });
    }
}
export function createHttpServer(router, staticDir) {
    return createServer((req, res) => {
        handleHttpRequest(router, req, res, staticDir);
    });
}
export function startHttpServer(options) {
    const server = createHttpServer(options.router, options.staticDir);
    return new Promise((resolve) => {
        server.listen(options.port, options.host, () => {
            resolve(server);
        });
    });
}
//# sourceMappingURL=http-server.js.map