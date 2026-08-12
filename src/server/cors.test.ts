import { describe, it, expect } from 'vitest';
import express from 'express';
import { createServer, request as httpRequest } from 'node:http';
import { AddressInfo } from 'node:net';

function httpFetch(url: string, options?: { method?: string; headers?: Record<string, string> }): Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined> }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = httpRequest(
      {
        hostname: urlObj.hostname,
        port: Number(urlObj.port),
        path: urlObj.pathname,
        method: options?.method ?? 'GET',
        headers: options?.headers,
      },
      (res: any) => {
        resolve({ statusCode: res.statusCode ?? 200, headers: res.headers });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('CORS middleware', () => {
  it('should not emit Access-Control-Allow-Origin: * when Origin is missing', async () => {
    const app = express();
    const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin) {
        const isDevelopmentPreview =
          origin.startsWith("http://localhost:") ||
          origin.startsWith("http://127.0.0.1:") ||
          origin.endsWith(".replit.dev") ||
          origin.endsWith(".repl.co") ||
          origin.endsWith(".webcontainer.io");
        const isExplicitlyAllowed = ALLOWED_ORIGINS.includes(origin);
        if (isDevelopmentPreview || isExplicitlyAllowed) {
          res.header("Access-Control-Allow-Origin", origin);
          res.header("Vary", "Origin");
        }
      }
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Client-Info, Apikey");
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
      next();
    });

    app.get('/test', (_req, res) => res.json({ ok: true }));

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as AddressInfo;

    const { statusCode, headers } = await httpFetch(`http://127.0.0.1:${addr.port}/test`);

    expect(statusCode).toBe(200);
    expect(headers['access-control-allow-origin']).toBeUndefined();
    expect(headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS');

    server.close();
  });

  it('should allow valid configured origins', async () => {
    const app = express();
    process.env.ALLOWED_ORIGINS = "https://example.com";
    const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin) {
        const isDevelopmentPreview =
          origin.startsWith("http://localhost:") ||
          origin.startsWith("http://127.0.0.1:") ||
          origin.endsWith(".replit.dev") ||
          origin.endsWith(".repl.co") ||
          origin.endsWith(".webcontainer.io");
        const isExplicitlyAllowed = ALLOWED_ORIGINS.includes(origin);
        if (isDevelopmentPreview || isExplicitlyAllowed) {
          res.header("Access-Control-Allow-Origin", origin);
          res.header("Vary", "Origin");
        }
      }
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Client-Info, Apikey");
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
      next();
    });

    app.get('/test', (_req, res) => res.json({ ok: true }));

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as AddressInfo;

    const { statusCode, headers } = await httpFetch(`http://127.0.0.1:${addr.port}/test`, {
      headers: { Origin: "https://example.com" }
    });

    expect(statusCode).toBe(200);
    expect(headers['access-control-allow-origin']).toBe("https://example.com");
    expect(headers['vary']).toBe("Origin");

    // Test disallowed origin
    const { headers: badHeaders } = await httpFetch(`http://127.0.0.1:${addr.port}/test`, {
      headers: { Origin: "https://bad-actor.com" }
    });
    expect(badHeaders['access-control-allow-origin']).toBeUndefined();

    server.close();
  });
  it('should fail closed when ALLOWED_ORIGINS is empty', async () => {
    const app = express();
    process.env.ALLOWED_ORIGINS = "";
    const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin) {
        const isDevelopmentPreview =
          origin.startsWith("http://localhost:") ||
          origin.startsWith("http://127.0.0.1:") ||
          origin.endsWith(".replit.dev") ||
          origin.endsWith(".repl.co") ||
          origin.endsWith(".webcontainer.io");
        const isExplicitlyAllowed = ALLOWED_ORIGINS.includes(origin);
        if (isDevelopmentPreview || isExplicitlyAllowed) {
          res.header("Access-Control-Allow-Origin", origin);
          res.header("Vary", "Origin");
        }
      }
      next();
    });

    app.get('/test', (_req, res) => res.json({ ok: true }));

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as AddressInfo;

    const { headers } = await httpFetch(`http://127.0.0.1:${addr.port}/test`, {
      headers: { Origin: "https://bad-actor.com" }
    });
    expect(headers['access-control-allow-origin']).toBeUndefined();

    server.close();
  });

  it('should still allow development preview domains when ALLOWED_ORIGINS is empty', async () => {
    const app = express();
    process.env.ALLOWED_ORIGINS = "";
    const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin) {
        const isDevelopmentPreview =
          origin.startsWith("http://localhost:") ||
          origin.startsWith("http://127.0.0.1:") ||
          origin.endsWith(".replit.dev") ||
          origin.endsWith(".repl.co") ||
          origin.endsWith(".webcontainer.io");
        const isExplicitlyAllowed = ALLOWED_ORIGINS.includes(origin);
        if (isDevelopmentPreview || isExplicitlyAllowed) {
          res.header("Access-Control-Allow-Origin", origin);
          res.header("Vary", "Origin");
        }
      }
      next();
    });

    app.get('/test', (_req, res) => res.json({ ok: true }));

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as AddressInfo;

    const { headers } = await httpFetch(`http://127.0.0.1:${addr.port}/test`, {
      headers: { Origin: "https://my-app.replit.dev" }
    });
    expect(headers['access-control-allow-origin']).toBe("https://my-app.replit.dev");

    server.close();
  });
});
