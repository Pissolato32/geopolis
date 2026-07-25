import { describe, it, expect } from 'vitest';
import { createServer, request as httpRequest } from 'node:http';
import { AddressInfo } from 'node:net';
import { WebSocket as WsClient } from 'ws';
import { WorldState } from '../core/world-state/world-state.js';
import { EventBus } from '../core/event-bus/event-bus.js';
import { Timeline } from '../core/timeline/timeline.js';
import { TickEngine } from '../core/tick-engine/tick-engine.js';
import { APIGatewayRouter } from './gateway-router.js';
import { TickBroadcaster } from './broadcaster.js';
import { handleHttpRequest } from './http-server.js';
import { attachWsTransport } from './ws-transport.js';
import { EntityId } from '../core/interfaces/entity.interface.js';
import { ECONOMIC_INDICATOR_TYPE } from '../domain/economy/components/economy.components.js';

function httpFetch(url: string, options?: { method?: string; body?: unknown }): Promise<{ statusCode: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = httpRequest(
      {
        hostname: urlObj.hostname,
        port: Number(urlObj.port),
        path: urlObj.pathname,
        method: options?.method ?? 'GET',
        headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          const body = raw ? JSON.parse(raw) : undefined;
          resolve({ statusCode: res.statusCode ?? 200, body });
        });
      },
    );
    req.on('error', reject);
    if (options?.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

describe('M1: HTTP Server transport', () => {
  function createRouter() {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('gw-http-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    worldState.createEntity('country-us' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 28700, inflationRate: 0.028, treasury: 1800, taxRate: 0.24 },
    ]);

    return { router: new APIGatewayRouter({ engine }), engine, worldState, eventBus, timeline };
  }

  it('should return 200 on GET /api/v1/state', async () => {
    const { router } = createRouter();
    const server = createServer((req, res) => handleHttpRequest(router, req, res));

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as AddressInfo;

    const { statusCode, body } = await httpFetch(`http://127.0.0.1:${addr.port}/api/v1/state`);
    expect(statusCode).toBe(200);
    const data = body as Record<string, unknown>;
    expect(data).toBeDefined();
    expect((data as Record<string, unknown>)['success']).toBe(true);

    server.close();
  });

  it('should return 200 on POST /api/v1/tick', async () => {
    const { router } = createRouter();
    const server = createServer((req, res) => handleHttpRequest(router, req, res));

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as AddressInfo;

    const { statusCode, body } = await httpFetch(`http://127.0.0.1:${addr.port}/api/v1/tick`, {
      method: 'POST',
      body: { count: 2 },
    });
    expect(statusCode).toBe(200);
    const data = body as Record<string, unknown>;
    expect((data as Record<string, unknown>)['success']).toBe(true);
    const innerData = data as Record<string, unknown>;
    expect((innerData['data'] as Record<string, unknown>)['executedTicks']).toBe(2);

    server.close();
  });

  it('should return 200 on POST /api/v1/action', async () => {
    const { router } = createRouter();
    const server = createServer((req, res) => handleHttpRequest(router, req, res));

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as AddressInfo;

    const { statusCode, body } = await httpFetch(`http://127.0.0.1:${addr.port}/api/v1/action`, {
      method: 'POST',
      body: { actionType: 'politics.maintain-stability', actorEntityId: 'country-us', parameters: {} },
    });
    expect(statusCode).toBe(200);
    const data = body as Record<string, unknown>;
    expect((data as Record<string, unknown>)['success']).toBe(true);

    server.close();
  });

  it('should return 200 on POST /api/v1/save', async () => {
    const { router } = createRouter();
    const server = createServer((req, res) => handleHttpRequest(router, req, res));

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as AddressInfo;

    const { statusCode, body } = await httpFetch(`http://127.0.0.1:${addr.port}/api/v1/save`, {
      method: 'POST',
    });
    expect(statusCode).toBe(200);
    const data = body as Record<string, unknown>;
    expect((data as Record<string, unknown>)['success']).toBe(true);

    server.close();
  });

  it('should return 404 on unknown route', async () => {
    const { router } = createRouter();
    const server = createServer((req, res) => handleHttpRequest(router, req, res));

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as AddressInfo;

    const { statusCode, body } = await httpFetch(`http://127.0.0.1:${addr.port}/api/v1/unknown`);
    expect(statusCode).toBe(404);
    const data = body as Record<string, unknown>;
    expect((data as Record<string, unknown>)['success']).toBe(false);

    server.close();
  });
});

describe('M2: WebSocket transport', () => {
  it('should broadcast tick_completed to connected clients', async () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('gw-ws-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    worldState.createEntity('country-us' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 28700, inflationRate: 0.028, treasury: 1800, taxRate: 0.24 },
    ]);

    const router = new APIGatewayRouter({ engine });
    const broadcaster = new TickBroadcaster();
    broadcaster.attach(engine, eventBus);

    const server = createServer((req, res) => handleHttpRequest(router, req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as AddressInfo;

    const wss = attachWsTransport({ server, broadcaster });

    const messages: unknown[] = [];
    const client = new WsClient(`ws://127.0.0.1:${addr.port}`);

    await new Promise<void>((resolve, reject) => {
      client.on('open', () => resolve());
      client.on('error', reject);
    });

    client.on('message', (raw: Buffer) => {
      messages.push(JSON.parse(raw.toString('utf-8')));
    });

    engine.tick();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(messages.length).toBeGreaterThanOrEqual(1);
    const first = messages[0] as Record<string, unknown>;
    expect(first['type']).toBe('tick_completed');
    expect(first['tick']).toBe(1);

    client.close();
    wss.close();
    server.close();
  });

  it('should broadcast event_emitted to connected clients', async () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('gw-ws-event-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    worldState.createEntity('country-us' as EntityId, [
      { type: ECONOMIC_INDICATOR_TYPE, gdp: 28700, inflationRate: 0.028, treasury: 1800, taxRate: 0.24 },
    ]);

    const router = new APIGatewayRouter({ engine });
    const broadcaster = new TickBroadcaster();
    broadcaster.attach(engine, eventBus);

    const server = createServer((req, res) => handleHttpRequest(router, req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as AddressInfo;

    const wss = attachWsTransport({ server, broadcaster });

    const messages: unknown[] = [];
    const client = new WsClient(`ws://127.0.0.1:${addr.port}`);

    await new Promise<void>((resolve, reject) => {
      client.on('open', () => resolve());
      client.on('error', reject);
    });

    client.on('message', (raw: Buffer) => {
      messages.push(JSON.parse(raw.toString('utf-8')));
    });

    // Publish an action event before tick to capture both tick_completed and event_emitted
    eventBus.publish('test.event', { foo: 'bar' }, 'gateway.test');
    eventBus.flush();
    engine.tick();

    await new Promise((resolve) => setTimeout(resolve, 100));

    const eventMessages = messages.filter(
      (m) => (m as Record<string, unknown>)['type'] === 'event_emitted',
    );
    expect(eventMessages.length).toBeGreaterThanOrEqual(1);

    client.close();
    wss.close();
    server.close();
  });
});
