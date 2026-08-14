import { describe, it, expect, vi } from 'vitest';
import { WorldState } from '../core/world-state/world-state.js';
import { EventBus } from '../core/event-bus/event-bus.js';
import { Timeline } from '../core/timeline/timeline.js';
import { TickEngine } from '../core/tick-engine/tick-engine.js';
import { APIGatewayRouter } from './gateway-router.js';
import { TickBroadcaster } from './broadcaster.js';
import { EntityId } from '../core/interfaces/entity.interface.js';
import { MapViewDTO } from '../core/interfaces/dto/map-view.dto.interface.js';
import { ECONOMIC_INDICATOR_TYPE } from '../domain/economy/components/economy.components.js';

describe('Phase 5: API Gateway & Headless Exposure (ADR-001 / ADR-002)', () => {
  function createEngine() {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('gateway-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    worldState.createEntity('country-us' as EntityId, [
      {
        type: ECONOMIC_INDICATOR_TYPE,
        gdp: 28700n,
        inflationRate: 0.028,
        treasury: 1800n,
        taxRate: 0.24,
      },
    ]);

    return { engine, worldState, eventBus, timeline };
  }

  it('should dispatch GET /api/v1/state request returning metadata and perception dump', async () => {
    const { engine } = createEngine();
    const router = new APIGatewayRouter({ engine });

    const response = await router.dispatch({
      path: '/api/v1/state',
      method: 'GET',
    });

    expect(response.statusCode).toBe(200);
    expect(response.success).toBe(true);
    expect(response.data).toBeDefined();

    const data = response.data as { metadata: { currentTick: number }; focalPerspectiveYaml: string };
    expect(data.metadata.currentTick).toBe(0);
    expect(data.focalPerspectiveYaml).toContain('focal_entity: country-us');
  });

  it('should dispatch POST /api/v1/tick request advancing simulation ticks', async () => {
    const { engine } = createEngine();
    const router = new APIGatewayRouter({ engine });

    const response = await router.dispatch({
      path: '/api/v1/tick',
      method: 'POST',
      payload: { count: 3 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.success).toBe(true);

    const data = response.data as { executedTicks: number; currentTick: number };
    expect(data.executedTicks).toBe(3);
    expect(data.currentTick).toBe(3);
  });

  it('should validate and process POST /api/v1/action request (Fail Fast)', async () => {
    const { engine } = createEngine();
    const router = new APIGatewayRouter({ engine });

    // Valid action
    const validRes = await router.dispatch({
      path: '/api/v1/action',
      method: 'POST',
      payload: {
        actionType: 'politics.maintain-stability',
        actorEntityId: 'country-us',
        parameters: { budget: 100 },
      },
    });

    expect(validRes.statusCode).toBe(200);
    expect(validRes.success).toBe(true);

    // Invalid action (Fail Fast)
    const invalidRes = await router.dispatch({
      path: '/api/v1/action',
      method: 'POST',
      payload: {
        actionType: '',
        actorEntityId: '',
      },
    });

    expect(invalidRes.statusCode).toBe(400);
    expect(invalidRes.success).toBe(false);
    expect(invalidRes.error).toContain('Action validation failed');
  });

  it('should handle POST /api/v1/save and POST /api/v1/load save game workflow via API', async () => {
    const { engine } = createEngine();
    const router = new APIGatewayRouter({ engine });

    engine.tick(); // Tick 1

    const saveRes = await router.dispatch({
      path: '/api/v1/save',
      method: 'POST',
    });

    expect(saveRes.statusCode).toBe(200);
    expect(saveRes.data).toBeDefined();

    const loadRes = await router.dispatch({
      path: '/api/v1/load',
      method: 'POST',
      payload: saveRes.data,
    });

    expect(loadRes.statusCode).toBe(200);
    expect(loadRes.success).toBe(true);
  });

  it('should generate BYOD prompt via POST /api/v1/byod/prompt', async () => {
    const { engine } = createEngine();
    const router = new APIGatewayRouter({ engine });

    const res = await router.dispatch({
      path: '/api/v1/byod/prompt',
      method: 'POST',
      payload: { campaignStartDate: '2026-07-24' },
    });

    expect(res.statusCode).toBe(200);
    const data = res.data as { prompt: string };
    expect(data.prompt).toContain('Campaign Start Date: 2026-07-24');
  });

  it('should broadcast tick completion and event emissions via TickBroadcaster', () => {
    const { engine, eventBus } = createEngine();
    const broadcaster = new TickBroadcaster();
    const mockHandler = vi.fn();

    broadcaster.subscribe(mockHandler);
    broadcaster.attach(engine, eventBus);

    engine.tick();

    expect(mockHandler).toHaveBeenCalled();
  });

  it('should return current scenario metadata on GET /api/v1/scenarios', async () => {
    const { engine } = createEngine();
    const router = new APIGatewayRouter({ engine });

    const response = await router.dispatch({
      path: '/api/v1/scenarios',
      method: 'GET',
    });

    expect(response.statusCode).toBe(200);
    expect(response.success).toBe(true);
    const data = response.data as { currentScenario: string };
    expect(data.currentScenario).toBe('gateway-test');
  });

  it('should reject POST /api/v1/scenarios/load without scenarioPath', async () => {
    const { engine } = createEngine();
    const router = new APIGatewayRouter({ engine });

    const response = await router.dispatch({
      path: '/api/v1/scenarios/load',
      method: 'POST',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.success).toBe(false);
    expect(response.error).toContain('scenarioPath is required');
  });

  it('should load a scenario via POST /api/v1/scenarios/load and restore engine', async () => {
    const { engine } = createEngine();
    const router = new APIGatewayRouter({ engine });

    // Write a temporary scenario file
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scenario-test-'));
    const scenarioPath = path.join(tempDir, 'test-scenario.json');

    const scenarioData = {
      metadata: {
        name: 'Gateway Test Scenario',
        version: '1.0.0',
        description: 'Temp scenario for gateway test',
        simulation: { maxTicks: 50 },
      },
      worldState: {
        entities: [
          {
            id: 'country-us',
            name: 'United States',
            entityType: 'country',
            components: [
              { type: 'economy.indicator', gdp: 28700, inflationRate: 0.028, treasury: 1800, taxRate: 0.24 },
            ],
          },
        ],
        relations: [],
      },
      eventTriggers: [],
    };

    fs.writeFileSync(scenarioPath, JSON.stringify(scenarioData));

    const response = await router.dispatch({
      path: '/api/v1/scenarios/load',
      method: 'POST',
      payload: { scenarioPath },
    });

    expect(response.statusCode).toBe(200);
    expect(response.success).toBe(true);
    const data = response.data as { scenarioId: string; entityCount: number };
    expect(data.scenarioId).toBe('scenario-gateway-test-scenario');
    expect(data.entityCount).toBe(1);

    // Cleanup
    fs.unlinkSync(scenarioPath);
    fs.rmdirSync(tempDir);
  });

  it('should return map view data on GET /api/v1/map', async () => {
    const { engine, worldState } = createEngine();
    const router = new APIGatewayRouter({ engine });

    worldState.createEntity('country-ru' as EntityId, [
      { type: 'geo.position', lat: 55, lng: 37 } as never,
      { type: 'economy.indicator', gdp: 4000n, inflationRate: 0.05, treasury: 500n, taxRate: 0.2 } as never,
      { type: 'military.forces', ownerCountryId: 'country-ru', totalPersonnel: 900000, forceLimit: 300000, readiness: 0.8, morale: 0.7, fuelReserves: 1000 } as never,
      { type: 'politics.stability', stabilityIndex: 0.5, approvalRating: 0.5, militaryLoyalty: 0.7 } as never,
      { type: 'diplomacy.relation', targetCountryId: 'country-us' as EntityId, affinity: -0.8, tension: 0.9, recognition: 'full', activeTreaties: [] } as never,
    ]);

    const response = await router.dispatch({ path: '/api/v1/map', method: 'GET' });

    expect(response.statusCode).toBe(200);
    expect(response.success).toBe(true);
    const data = response.data as MapViewDTO;
    expect(data.entities.length).toBeGreaterThanOrEqual(1);
    const ru = data.entities.find((e) => e.id === 'country-ru');
    expect(ru).toBeDefined();
    expect(ru!.coordinates.lat).toBe(55);
    expect(ru!.militaryPresence).toBe('high');
    expect(ru!.economicStatus).toBe('stable');
    expect(data.activeConflicts.length).toBeGreaterThanOrEqual(1);
  });

  it('should include active trade routes in map view data', async () => {
    const { engine, worldState } = createEngine();
    const router = new APIGatewayRouter({ engine });

    worldState.createEntity('country-de' as EntityId, [
      { type: 'geo.position', lat: 52, lng: 13 } as never,
      { type: 'economy.indicator', gdp: 4000n, inflationRate: 0.02, treasury: 800n, taxRate: 0.2 } as never,
      { type: 'economy.trade-route', sourceCountryId: 'country-de' as EntityId, targetCountryId: 'country-us' as EntityId, resourceType: 'industrial', volumePerTick: 50, isActive: true, establishedTick: 0, blockadeLevel: 0 } as never,
    ]);

    const response = await router.dispatch({ path: '/api/v1/map', method: 'GET' });
    const data = response.data as MapViewDTO;
    const tradeRoute = data.activeTradeRoutes.find(
      (r) => r.source === 'country-de' && r.target === 'country-us',
    );
    expect(tradeRoute).toBeDefined();
    expect(tradeRoute!.volume).toBe(50);
  });
});
