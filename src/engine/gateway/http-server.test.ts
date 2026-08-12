import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IncomingMessage, ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';
import { createHttpServer, startHttpServer, handleHttpRequest, IHttpServerOptions } from './http-server.js';
import { APIGatewayRouter } from './gateway-router.js';

// Mock fs and path for static serving tests
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:path')>();
  return {
    ...actual,
    resolve: vi.fn((dir, file) => `${dir}/${file}`),
    extname: actual.extname,
  };
});

// Helper to mock IncomingMessage
class MockReq extends EventEmitter {
  method?: string;
  url?: string;

  constructor(method = 'GET', url = '/') {
    super();
    this.method = method;
    this.url = url;
  }
}

// Helper to mock ServerResponse
class MockRes {
  statusCode: number = 200;
  headers: Record<string, string> = {};
  body: string = '';

  writeHead(statusCode: number, headers: Record<string, string>) {
    this.statusCode = statusCode;
    this.headers = headers;
  }

  end(data: string) {
    this.body = data;
  }
}

describe('http-server', () => {
  let router: APIGatewayRouter;
  let fs: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    fs = await import('node:fs');

    // Mock the router
    router = {
      dispatch: vi.fn(),
    } as unknown as APIGatewayRouter;
  });

  describe('createHttpServer', () => {
    it('should create an http server instance', () => {
      const server = createHttpServer(router);
      expect(server).toBeDefined();
      expect(server.listen).toBeInstanceOf(Function);
    });
  });

  describe('startHttpServer', () => {
    it('should start the server and resolve when listening', async () => {
      const options: IHttpServerOptions = {
        host: '127.0.0.1',
        port: 8080,
        router,
      };

      // Avoid mocking node:http which is immutable, instead let createHttpServer run normally
      // and test that it eventually binds. Because it actually binds, we must close it.
      const startedServer = await startHttpServer({ ...options, port: 0 }); // Use 0 for dynamic port
      expect(startedServer).toBeDefined();
      expect(startedServer.address()).toBeDefined();

      startedServer.close();
    });
  });

  describe('handleHttpRequest - API Routes', () => {
    it('should route GET /api/* to router.dispatch', async () => {
      const req = new MockReq('GET', '/api/v1/state') as unknown as IncomingMessage;
      const res = new MockRes() as unknown as ServerResponse;

      vi.mocked(router.dispatch).mockResolvedValue({
        statusCode: 200,
        success: true,
        data: { hello: 'world' },
      });

      await handleHttpRequest(router, req, res);

      expect(router.dispatch).toHaveBeenCalledWith({
        path: '/api/v1/state',
        method: 'GET',
        payload: undefined,
      });

      expect((res as unknown as MockRes).statusCode).toBe(200);
      expect((res as unknown as MockRes).headers).toEqual({ 'Content-Type': 'application/json' });
      expect((res as unknown as MockRes).body).toBe(JSON.stringify({ statusCode: 200, success: true, data: { hello: 'world' } }));
    });

    it('should route POST /api/* to router.dispatch and parse JSON body', async () => {
      const req = new MockReq('POST', '/api/v1/action') as unknown as IncomingMessage;
      const res = new MockRes() as unknown as ServerResponse;

      vi.mocked(router.dispatch).mockResolvedValue({
        statusCode: 201,
        success: true,
        data: { created: true },
      });

      const handlePromise = handleHttpRequest(router, req, res);

      // Simulate body chunking
      req.emit('data', Buffer.from('{"action":'));
      req.emit('data', Buffer.from('"test"}'));
      req.emit('end');

      await handlePromise;

      expect(router.dispatch).toHaveBeenCalledWith({
        path: '/api/v1/action',
        method: 'POST',
        payload: { action: 'test' },
      });

      expect((res as unknown as MockRes).statusCode).toBe(201);
      expect((res as unknown as MockRes).body).toContain('"created":true');
    });

    it('should handle POST /api/* with invalid JSON gracefully', async () => {
      const req = new MockReq('POST', '/api/v1/action') as unknown as IncomingMessage;
      const res = new MockRes() as unknown as ServerResponse;

      const handlePromise = handleHttpRequest(router, req, res);

      req.emit('data', Buffer.from('{invalid:json}'));
      req.emit('end');

      await handlePromise;

      // Ensure 500 error is caught and sent
      expect((res as unknown as MockRes).statusCode).toBe(500);
      expect(JSON.parse((res as unknown as MockRes).body)).toMatchObject({
        statusCode: 500,
        success: false,
        error: expect.any(String),
      });
    });

    it('should handle router exceptions and return 500', async () => {
      const req = new MockReq('GET', '/api/v1/error') as unknown as IncomingMessage;
      const res = new MockRes() as unknown as ServerResponse;

      vi.mocked(router.dispatch).mockRejectedValue(new Error('Router failure'));

      await handleHttpRequest(router, req, res);

      expect((res as unknown as MockRes).statusCode).toBe(500);
      expect(JSON.parse((res as unknown as MockRes).body)).toEqual({
        statusCode: 500,
        success: false,
        error: 'Router failure',
      });
    });
  });

  describe('handleHttpRequest - Static Files', () => {
    it('should serve exact matched static file', async () => {
      const req = new MockReq('GET', '/style.css') as unknown as IncomingMessage;
      const res = new MockRes() as unknown as ServerResponse;

      vi.mocked(fs.existsSync).mockImplementation((path: string) => path === 'public/style.css');
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('body { color: red; }'));

      await handleHttpRequest(router, req, res, 'public');

      expect(fs.existsSync).toHaveBeenCalledWith('public/style.css');
      expect(fs.readFileSync).toHaveBeenCalledWith('public/style.css');
      expect((res as unknown as MockRes).statusCode).toBe(200);
      expect((res as unknown as MockRes).headers).toEqual({ 'Content-Type': 'text/css; charset=utf-8' });
      expect((res as unknown as MockRes).body).toEqual(Buffer.from('body { color: red; }'));
    });

    it('should map / to index.html', async () => {
      const req = new MockReq('GET', '/') as unknown as IncomingMessage;
      const res = new MockRes() as unknown as ServerResponse;

      vi.mocked(fs.existsSync).mockImplementation((path: string) => path === 'public/index.html');
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('<html></html>'));

      await handleHttpRequest(router, req, res, 'public');

      expect(fs.existsSync).toHaveBeenCalledWith('public/index.html');
      expect((res as unknown as MockRes).statusCode).toBe(200);
      expect((res as unknown as MockRes).headers).toEqual({ 'Content-Type': 'text/html; charset=utf-8' });
    });

    it('should fallback to index.html if file not found but index.html exists', async () => {
      const req = new MockReq('GET', '/non-existent-route') as unknown as IncomingMessage;
      const res = new MockRes() as unknown as ServerResponse;

      vi.mocked(fs.existsSync).mockImplementation((path: string) => path === 'public/index.html');
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('<html>SPA Fallback</html>'));

      await handleHttpRequest(router, req, res, 'public');

      expect(fs.existsSync).toHaveBeenCalledWith('public/non-existent-route');
      expect(fs.existsSync).toHaveBeenCalledWith('public/index.html');
      expect((res as unknown as MockRes).statusCode).toBe(200);
      expect((res as unknown as MockRes).headers).toEqual({ 'Content-Type': 'text/html; charset=utf-8' });
      expect((res as unknown as MockRes).body).toEqual(Buffer.from('<html>SPA Fallback</html>'));
    });

    it('should default to application/octet-stream for unknown extensions', async () => {
      const req = new MockReq('GET', '/file.unknown') as unknown as IncomingMessage;
      const res = new MockRes() as unknown as ServerResponse;

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('binary data'));

      await handleHttpRequest(router, req, res, 'public');

      expect((res as unknown as MockRes).statusCode).toBe(200);
      expect((res as unknown as MockRes).headers).toEqual({ 'Content-Type': 'application/octet-stream' });
    });

    it('should return 404 if no static dir provided and route is not /api', async () => {
      const req = new MockReq('GET', '/unknown') as unknown as IncomingMessage;
      const res = new MockRes() as unknown as ServerResponse;

      await handleHttpRequest(router, req, res);

      expect((res as unknown as MockRes).statusCode).toBe(404);
      expect((res as unknown as MockRes).headers).toEqual({ 'Content-Type': 'text/plain' });
      expect((res as unknown as MockRes).body).toBe('Not Found');
    });

    it('should return 404 if file and index.html are not found', async () => {
      const req = new MockReq('GET', '/unknown') as unknown as IncomingMessage;
      const res = new MockRes() as unknown as ServerResponse;

      vi.mocked(fs.existsSync).mockReturnValue(false);

      await handleHttpRequest(router, req, res, 'public');

      expect((res as unknown as MockRes).statusCode).toBe(404);
      expect((res as unknown as MockRes).body).toBe('Not Found');
    });
  });
});
