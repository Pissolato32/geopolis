import { ITickEngine } from '../core/interfaces/tick-engine.interface.js';
import { ISystem } from '../core/interfaces/system.interface.js';
import { StrictIntentParser } from '../agents/parser/strict-intent-parser.js';
import { SeedPromptGenerator } from '../domain/seed/prompt-generator.js';
import { loadWorldSeed } from '../domain/seed/seed-loader.js';
import { SaveGameSerializer } from '../persistence/serializer.js';
import { ISaveGamePayload } from '../persistence/interfaces/save-game.interface.js';
import {
  IGatewayRequest,
  IGatewayResponse,
  ITickExecutionRequest,
  IActionSubmissionRequest,
  IByodPromptRequest,
} from './interfaces/gateway.interface.js';
import { PerceptionFilter } from '../agents/perception/perception-filter.js';
import { EntityId } from '../core/interfaces/entity.interface.js';
import { IWorldSeed } from '../core/interfaces/world-seed.interface.js';
import { ScenarioLoader, GEO_POSITION_TYPE, GEO_PROVINCE_TYPE } from '../scenarios/scenario.loader.js';
import type { GeoPositionComponent, ProvinceListComponent } from '../scenarios/scenario.loader.js';
import { AchievementManager } from '../scenarios/achievement-manager.js';
import {
  MILITARY_UNIT_TYPE,
  MilitaryUnitComponent,
} from '../domain/war/components/war.components.js';
import {
  WAR_MOVE_ORDERED_EVENT,
  WAR_PEACE_REQUESTED_EVENT,
} from '../domain/war/events/war.events.js';
import { SeedSyncPipeline } from '../scenarios/seed-sync-pipeline.js';
import { SeedValidationSuite } from '../scenarios/seed-validation-suite.js';
import { GeopoliticalAnomalyResolver } from '../scenarios/geopolitical-anomaly-resolver.js';

export interface IAPIGatewayRouterConfig {
  engine: ITickEngine;
  systems?: ReadonlyArray<ISystem> | undefined;
  baseSeed?: IWorldSeed | undefined;
}

/**
 * Framework-agnostic Headless API Gateway Router for GeoPolis Engine.
 * Translates external REST requests into Engine queries, action emissions, and save/load calls.
 */
export class APIGatewayRouter {
  private engine: ITickEngine;
  private readonly systems: ReadonlyArray<ISystem>;
  private readonly baseSeed?: IWorldSeed;
  private readonly parser = new StrictIntentParser();

  constructor(config: IAPIGatewayRouterConfig) {
    this.engine = config.engine;
    this.systems = config.systems ?? [];
    if (config.baseSeed) {
      this.baseSeed = config.baseSeed;
    }
  }

  /**
   * Dispatch an incoming gateway HTTP request payload to the appropriate controller route.
   */
  public async dispatch<TReq = unknown, TRes = unknown>(
    request: IGatewayRequest<TReq>,
  ): Promise<IGatewayResponse<TRes>> {
    const { path, method, payload } = request;

    try {
      if (path === '/api/v1/state' && method === 'GET') {
        return this.handleGetState() as IGatewayResponse<TRes>;
      }

      if (path === '/api/v1/tick' && method === 'POST') {
        return this.handlePostTick((payload ?? {}) as ITickExecutionRequest) as IGatewayResponse<TRes>;
      }

      if (path === '/api/v1/action' && method === 'POST') {
        return this.handlePostAction((payload ?? {}) as IActionSubmissionRequest) as IGatewayResponse<TRes>;
      }

      if (path === '/api/v1/save' && method === 'POST') {
        return this.handlePostSave() as IGatewayResponse<TRes>;
      }

      if (path === '/api/v1/load' && method === 'POST') {
        return this.handlePostLoad((payload ?? {}) as ISaveGamePayload) as IGatewayResponse<TRes>;
      }

      if (path === '/api/v1/byod/prompt' && method === 'POST') {
        return this.handlePostByodPrompt((payload ?? {}) as IByodPromptRequest) as IGatewayResponse<TRes>;
      }

      if (path === '/api/v1/byod/load' && method === 'POST') {
        return this.handlePostByodLoad(payload) as IGatewayResponse<TRes>;
      }

      if (path === '/api/v1/scenarios' && method === 'GET') {
        return this.handleGetScenarios() as IGatewayResponse<TRes>;
      }

      if (path === '/api/v1/scenarios/load' && method === 'POST') {
        return this.handlePostScenariosLoad(payload) as IGatewayResponse<TRes>;
      }

      if (path === '/api/v1/entities' && method === 'GET') {
        return this.handleGetEntities() as IGatewayResponse<TRes>;
      }

      if (path === '/api/v1/provinces' && method === 'GET') {
        return this.handleGetProvinces() as IGatewayResponse<TRes>;
      }

      if (path === '/api/v1/achievements/unlock' && method === 'POST') {
        return this.handlePostAchievementsUnlock(payload) as IGatewayResponse<TRes>;
      }

      if (path === '/api/v1/military/state' && method === 'GET') {
        return this.handleGetMilitaryState() as IGatewayResponse<TRes>;
      }

      if (path === '/api/v1/military/move' && method === 'POST') {
        return this.handlePostMilitaryMove(payload) as IGatewayResponse<TRes>;
      }

      if (path === '/api/v1/military/deploy' && method === 'POST') {
        return this.handlePostMilitaryDeploy(payload) as IGatewayResponse<TRes>;
      }

      if (path === '/api/v1/military/peace' && method === 'POST') {
        return this.handlePostMilitaryPeace(payload) as IGatewayResponse<TRes>;
      }

      if (path === '/api/v1/seed/update' && method === 'POST') {
        return await this.handlePostSeedUpdate(payload) as IGatewayResponse<TRes>;
      }

      return {
        statusCode: 404,
        success: false,
        error: `Route not found: ${method} ${path}`,
      };
    } catch (err) {
      return {
        statusCode: 500,
        success: false,
        error: err instanceof Error ? err.message : 'Internal Server Error',
      };
    }
  }

  private handleGetState(): IGatewayResponse {
    const worldState = this.engine.getWorldState();
    const metadata = worldState.getMetadata();

    // Default to perception dump for country-us or first entity
    const focalId = worldState.hasEntity('country-us' as EntityId) ? ('country-us' as EntityId) : undefined;
    const perceptionYaml = focalId ? PerceptionFilter.generatePerceptionDump(worldState, focalId) : undefined;

    const entities: Record<string, unknown> = {};
    for (const eid of worldState.getEntityIds()) {
      const entity = worldState.getEntity(eid);
      if (!entity) continue;
      const position = entity.getComponent(GEO_POSITION_TYPE) as GeoPositionComponent | undefined;
      const components: Record<string, unknown> = {};
      for (const type of entity.getComponentTypes()) {
        if (type === GEO_POSITION_TYPE || type === GEO_PROVINCE_TYPE) continue;
        const comp = entity.getComponent(type);
        if (comp) components[type] = comp;
      }
      entities[eid] = {
        id: eid,
        name: eid,
        entityType: 'country',
        position: position ? { lat: position.lat, lng: position.lng } : undefined,
        components,
      };
    }

    const provinces: Record<string, unknown> = {};
    for (const eid of worldState.getEntityIds()) {
      const entity = worldState.getEntity(eid);
      if (!entity) continue;
      const provComponent = entity.getComponent(GEO_PROVINCE_TYPE) as ProvinceListComponent | undefined;
      if (provComponent) {
        provinces[eid] = provComponent.provinces;
      }
    }

    return {
      statusCode: 200,
      success: true,
      data: {
        tick: metadata.currentTick,
        entities,
        provinces,
        metadata,
        focalPerspectiveYaml: perceptionYaml,
      },
    };
  }

  private handlePostTick(payload: ITickExecutionRequest): IGatewayResponse {
    const count = payload.count ?? 1;
    const results = this.engine.runTicks(count);

    return {
      statusCode: 200,
      success: true,
      data: {
        executedTicks: results.length,
        currentTick: this.engine.getCurrentTick(),
        lastResult: results[results.length - 1],
      },
    };
  }

  private handlePostAction(payload: IActionSubmissionRequest): IGatewayResponse {
    const validation = this.parser.validate(
      {
        actionType: payload.actionType,
        actorEntityId: payload.actorEntityId,
        ...(payload.targetEntityId !== undefined ? { targetEntityId: payload.targetEntityId } : {}),
        parameters: payload.parameters ?? {},
        ...(payload.narrativeSummary !== undefined ? { narrativeSummary: payload.narrativeSummary } : {}),
      },
      this.engine.getCurrentTick(),
    );

    if (!validation.isValid || !validation.validatedPayload) {
      return {
        statusCode: 400,
        success: false,
        error: `Action validation failed: ${validation.errors?.join('; ')}`,
      };
    }

    const eventBus = this.engine.getEventBus();
    const eventId = eventBus.publish(
      validation.validatedPayload.actionType,
      validation.validatedPayload.parameters,
      'gateway.api',
      validation.validatedPayload.actorEntityId,
    );

    return {
      statusCode: 200,
      success: true,
      data: {
        eventId,
        actionType: validation.validatedPayload.actionType,
        status: 'queued',
      },
    };
  }

  private handlePostSave(): IGatewayResponse {
    const savePayload = SaveGameSerializer.createSaveGame(this.engine);
    return {
      statusCode: 200,
      success: true,
      data: savePayload,
    };
  }

  private handlePostLoad(payload: ISaveGamePayload): IGatewayResponse {
    const rehydrated = SaveGameSerializer.rehydrateEngine(payload, this.systems);
    this.engine = rehydrated.tickEngine;

    return {
      statusCode: 200,
      success: true,
      data: {
        currentTick: this.engine.getCurrentTick(),
        scenarioId: payload.scenarioId,
        status: 'rehydrated',
      },
    };
  }

  private handlePostByodPrompt(payload: IByodPromptRequest): IGatewayResponse {
    const prompt = SeedPromptGenerator.generateInitializationPrompt(payload.campaignStartDate);
    return {
      statusCode: 200,
      success: true,
      data: { prompt },
    };
  }

  private handlePostByodLoad(deltaPatch: unknown): IGatewayResponse {
    if (!this.baseSeed) {
      return {
        statusCode: 400,
        success: false,
        error: 'Cannot load BYOD patch: No Base Seed provided to APIGatewayRouter',
      };
    }

    const worldState = this.engine.getWorldState();
    const result = loadWorldSeed(worldState, this.baseSeed, deltaPatch);

    return {
      statusCode: 200,
      success: true,
      data: {
        effectiveStartDate: result.effectiveStartDate,
        sanitizationReport: result.sanitizationReport,
      },
    };
  }

  private handleGetScenarios(): IGatewayResponse {
    const metadata = this.engine.getWorldState().getMetadata();
    return {
      statusCode: 200,
      success: true,
      data: {
        currentScenario: metadata.scenarioId,
        currentTick: metadata.currentTick,
        entityCount: metadata.entityCount,
      },
    };
  }

  private handleGetEntities(): IGatewayResponse {
    const worldState = this.engine.getWorldState();
    const entities: Record<string, unknown> = {};

    for (const eid of worldState.getEntityIds()) {
      const entity = worldState.getEntity(eid);
      if (!entity) continue;

      const position = entity.getComponent(GEO_POSITION_TYPE) as GeoPositionComponent | undefined;
      const components: Record<string, unknown> = {};

      for (const type of entity.getComponentTypes()) {
        if (type === GEO_POSITION_TYPE || type === GEO_PROVINCE_TYPE) continue;
        const comp = entity.getComponent(type);
        if (comp) components[type] = comp;
      }

      entities[eid] = {
        id: eid,
        name: eid,
        entityType: 'country',
        position: position ? { lat: position.lat, lng: position.lng } : undefined,
        components,
      };
    }

    return { statusCode: 200, success: true, data: entities };
  }

  private handleGetProvinces(): IGatewayResponse {
    const worldState = this.engine.getWorldState();
    const provinces: Record<string, unknown> = {};

    for (const eid of worldState.getEntityIds()) {
      const entity = worldState.getEntity(eid);
      if (!entity) continue;

      const provComponent = entity.getComponent(GEO_PROVINCE_TYPE) as ProvinceListComponent | undefined;
      if (provComponent) {
        provinces[eid] = provComponent.provinces;
      }
    }

    return { statusCode: 200, success: true, data: provinces };
  }

  private handlePostAchievementsUnlock(payload: unknown): IGatewayResponse {
    const req = payload as { achievementId?: string } | undefined;
    const achievementId = req?.achievementId;
    if (!achievementId) {
      return { statusCode: 400, success: false, error: 'achievementId is required in payload' };
    }

    for (const sys of this.systems) {
      if (sys instanceof AchievementManager) {
        sys.unlockFromFrontend(achievementId);
        return { statusCode: 200, success: true, data: { achievementId, status: 'unlocked' } };
      }
    }

    return { statusCode: 404, success: false, error: 'AchievementManager not registered' };
  }

  private handlePostScenariosLoad(payload: unknown): IGatewayResponse {
    const req = payload as { scenarioPath?: string } | undefined;
    const scenarioPath = req?.scenarioPath;
    if (!scenarioPath) {
      return {
        statusCode: 400,
        success: false,
        error: 'scenarioPath is required in payload',
      };
    }

    const loader = new ScenarioLoader();
    const result = loader.loadFromFile(scenarioPath, { systems: this.systems as ISystem[] });

    this.engine = result.engine;

    return {
      statusCode: 200,
      success: true,
      data: {
        scenarioId: result.loadResult.scenarioId,
        entityCount: result.loadResult.entityCount,
        relationCount: result.loadResult.relationCount,
        triggerCount: result.loadResult.triggerCount,
        currentTick: this.engine.getCurrentTick(),
      },
    };
  }

  private handleGetMilitaryState(): IGatewayResponse {
    const worldState = this.engine.getWorldState();
    const units: unknown[] = [];

    for (const eid of worldState.getEntityIds()) {
      const entity = worldState.getEntity(eid);
      if (!entity) continue;
      const mil = entity.getComponent(MILITARY_UNIT_TYPE) as MilitaryUnitComponent | undefined;
      if (!mil) continue;

      units.push({
        unitId: eid,
        ownerCountryId: mil.ownerCountryId,
        unitName: mil.unitName,
        currentProvinceId: mil.currentProvinceId,
        personnel: mil.personnel,
        readiness: mil.readiness,
        morale: mil.morale,
        fuelReserves: mil.fuelReserves,
        moveTargetProvinceId: mil.moveTargetProvinceId,
        moveProgress: mil.moveProgress,
      });
    }

    const provincesByOwner: Record<string, number> = {};
    for (const eid of worldState.getEntityIds()) {
      const entity = worldState.getEntity(eid);
      if (!entity) continue;
      const provComponent = entity.getComponent(GEO_PROVINCE_TYPE) as ProvinceListComponent | undefined;
      if (provComponent) {
        provincesByOwner[eid] = provComponent.provinces.length;
      }
    }

    return {
      statusCode: 200,
      success: true,
      data: { units, provinceCountByOwner: provincesByOwner },
    };
  }

  private handlePostMilitaryMove(payload: unknown): IGatewayResponse {
    const req = payload as { unitId?: string; targetProvinceId?: string } | undefined;

    if (!req?.unitId || !req?.targetProvinceId) {
      return {
        statusCode: 400,
        success: false,
        error: 'unitId and targetProvinceId are required',
      };
    }

    const worldState = this.engine.getWorldState();
    if (!worldState.hasEntity(req.unitId as EntityId)) {
      return {
        statusCode: 404,
        success: false,
        error: `Unit not found: ${req.unitId}`,
      };
    }

    const entity = worldState.getEntity(req.unitId as EntityId);
    const mil = entity?.getComponent(MILITARY_UNIT_TYPE) as MilitaryUnitComponent | undefined;
    if (!mil) {
      return {
        statusCode: 400,
        success: false,
        error: `Entity ${req.unitId} is not a military unit`,
      };
    }

    const eventBus = this.engine.getEventBus();
    const eventId = eventBus.publish(
      WAR_MOVE_ORDERED_EVENT,
      { unitId: req.unitId, targetProvinceId: req.targetProvinceId },
      'gateway.api',
      req.unitId as EntityId,
    );

    return {
      statusCode: 200,
      success: true,
      data: {
        eventId,
        unitId: req.unitId,
        targetProvinceId: req.targetProvinceId,
        status: 'move-ordered',
      },
    };
  }

  private handlePostMilitaryDeploy(payload: unknown): IGatewayResponse {
    const req = payload as {
      countryId?: string;
      provinceId?: string;
      unitName?: string;
      personnel?: number;
    } | undefined;

    if (!req?.countryId || !req?.provinceId || !req?.unitName || !req?.personnel) {
      return {
        statusCode: 400,
        success: false,
        error: 'countryId, provinceId, unitName, and personnel are required',
      };
    }

    if (req.personnel < 1) {
      return {
        statusCode: 400,
        success: false,
        error: 'personnel must be a positive number',
      };
    }

    const worldState = this.engine.getWorldState();
    const unitId = `unit-${req.countryId}-${req.provinceId}-${Date.now()}` as EntityId;

    if (worldState.hasEntity(unitId)) {
      return {
        statusCode: 409,
        success: false,
        error: `Unit ID collision: ${unitId}`,
      };
    }

    const milComponent: MilitaryUnitComponent = {
      type: MILITARY_UNIT_TYPE,
      ownerCountryId: req.countryId as EntityId,
      unitName: req.unitName,
      personnel: req.personnel,
      readiness: 0.9,
      morale: 0.85,
      fuelReserves: 100,
      currentProvinceId: req.provinceId,
    };

    worldState.createEntity(unitId, [milComponent as unknown as import('../core/interfaces/component.interface.js').IComponent]);

    return {
      statusCode: 200,
      success: true,
      data: {
        unitId,
        ownerCountryId: req.countryId,
        provinceId: req.provinceId,
        unitName: req.unitName,
        personnel: req.personnel,
        status: 'deployed',
      },
    };
  }

  private handlePostMilitaryPeace(payload: unknown): IGatewayResponse {
    const req = payload as {
      initiator?: string;
      target?: string;
      returnProvinces?: string[];
    } | undefined;

    if (!req?.initiator || !req?.target) {
      return {
        statusCode: 400,
        success: false,
        error: 'initiator and target are required',
      };
    }

    const eventBus = this.engine.getEventBus();
    const eventId = eventBus.publish(
      WAR_PEACE_REQUESTED_EVENT,
      {
        initiator: req.initiator,
        target: req.target,
        returnProvinces: req.returnProvinces,
      },
      'gateway.api',
      req.initiator as EntityId,
    );

    return {
      statusCode: 200,
      success: true,
      data: {
        eventId,
        initiator: req.initiator,
        target: req.target,
        status: 'peace-requested',
      },
    };
  }

  private async handlePostSeedUpdate(payload: unknown): Promise<IGatewayResponse> {
    const req = payload as { forceFullSync?: boolean } | undefined;
    const forceFull = req?.forceFullSync ?? false;

    const pipeline = new SeedSyncPipeline();
    const syncResult = await pipeline.sync();

    if (syncResult.status === 'no-cache') {
      return {
        statusCode: 503,
        success: false,
        error: 'No baseline seed available for sync',
      };
    }

    // Load baseline for anomaly resolution and validation
    const baseline = SeedSyncPipeline.loadBaseline();
    if (!baseline) {
      return {
        statusCode: 503,
        success: false,
        error: 'Baseline seed file not found on disk',
      };
    }

    // Run anomaly resolver
    const resolver = new GeopoliticalAnomalyResolver();
    const resolution = resolver.resolve(baseline, baseline);

    // Run pre-consolidation test gate
    const validationSuite = new SeedValidationSuite();
    const updatedSeed = { ...baseline, countries: resolution.resolvedCountries };
    const validation = validationSuite.validate(updatedSeed);

    if (!validation.passed) {
      return {
        statusCode: 422,
        success: false,
        error: 'Seed validation failed — falling back to baseline',
        data: {
          syncStatus: syncResult.status,
          validationErrors: validation.errors,
          anomaliesDetected: resolution.logs.length,
        },
      };
    }

    return {
      statusCode: 200,
      success: true,
      data: {
        status: syncResult.status === 'up-to-date' ? 'success' : 'success',
        updatedEntities: syncResult.updatedEntities,
        deltaSizeKb: syncResult.deltaSizeKb,
        anomaliesDetected: resolution.logs.length,
        newEntities: resolution.newEntities,
        removedEntities: resolution.removedEntities,
        validationDurationMs: validation.totalDurationMs,
        seedVersion: syncResult.seedVersion,
        forceFullSync: forceFull,
      },
    };
  }
}
