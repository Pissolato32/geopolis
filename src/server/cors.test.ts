import { describe, expect, it } from "vitest";
import express from "express";
import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { createCorsMiddleware } from "./cors.js";

function httpFetch(
  url: string,
  options?: { method?: string; headers?: Record<string, string> },
): Promise<{
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
}> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = httpRequest(
      {
        hostname: urlObj.hostname,
        port: Number(urlObj.port),
        path: urlObj.pathname,
        method: options?.method ?? "GET",
        headers: options?.headers,
      },
      (res) => {
        resolve({ statusCode: res.statusCode ?? 200, headers: res.headers });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function startTestServer(allowedOrigins: string[] = []) {
  const app = express();
  app.use(createCorsMiddleware(allowedOrigins));
  app.get("/test", (_req, res) => res.json({ ok: true }));

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address() as AddressInfo;

  return { server, url: `http://127.0.0.1:${addr.port}/test` };
}

describe("CORS middleware", () => {
  it("rejects arbitrary origins when the allowlist is empty", async () => {
    const { server, url } = await startTestServer([]);
    const { headers } = await httpFetch(url, {
      headers: { Origin: "https://bad-actor.com" },
    });

    expect(headers["access-control-allow-origin"]).toBeUndefined();
    server.close();
  });

  it("allows explicitly configured origins", async () => {
    const { server, url } = await startTestServer(["https://example.com"]);
    const { headers } = await httpFetch(url, {
      headers: { Origin: "https://example.com" },
    });

    expect(headers["access-control-allow-origin"]).toBe("https://example.com");
    expect(headers["vary"]).toBe("Origin");

    const { headers: badHeaders } = await httpFetch(url, {
      headers: { Origin: "https://bad-actor.com" },
    });
    expect(badHeaders["access-control-allow-origin"]).toBeUndefined();
    server.close();
  });

  it("rejects preview origins when not explicitly configured", async () => {
    const { server, url } = await startTestServer([]);

    for (const previewOrigin of [
      "https://my-app.replit.dev",
      "https://my-app.repl.co",
      "https://my-app.webcontainer.io"
    ]) {
      const { headers } = await httpFetch(url, {
        headers: { Origin: previewOrigin },
      });
      expect(headers["access-control-allow-origin"]).toBeUndefined();
    }

    server.close();
  });

  it("allows preview origins when explicitly configured", async () => {
    const previewOrigin = "https://my-app.replit.dev";
    const { server, url } = await startTestServer([previewOrigin]);

    const { headers } = await httpFetch(url, {
      headers: { Origin: previewOrigin },
    });

    expect(headers["access-control-allow-origin"]).toBe(previewOrigin);

    server.close();
  });

  it("allows localhost origins when the allowlist is empty", async () => {
    const { server, url } = await startTestServer([]);

    for (const localOrigin of [
      "http://localhost:3000",
      "http://127.0.0.1:5173"
    ]) {
      const { headers } = await httpFetch(url, {
        headers: { Origin: localOrigin },
      });
      expect(headers["access-control-allow-origin"]).toBe(localOrigin);
    }

    server.close();
  });

  it("does not emit an allow-origin header when Origin is missing", async () => {
    const { server, url } = await startTestServer([]);
    const { statusCode, headers } = await httpFetch(url);

    expect(statusCode).toBe(200);
    expect(headers["access-control-allow-origin"]).toBeUndefined();
    expect(headers["access-control-allow-methods"]).toBe("GET, POST, OPTIONS");
    server.close();
  });
});
