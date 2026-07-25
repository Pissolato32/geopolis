import { StrictIntentParser } from '../agents/parser/strict-intent-parser.js';
import { SeedPromptGenerator } from '../domain/seed/prompt-generator.js';
import { loadWorldSeed } from '../domain/seed/seed-loader.js';
import { SaveGameSerializer } from '../persistence/serializer.js';
import { PerceptionFilter } from '../agents/perception/perception-filter.js';
import { ScenarioLoader, GEO_POSITION_TYPE, GEO_PROVINCE_TYPE } from '../scenarios/scenario.loader.js';
import { AchievementManager } from '../scenarios/achievement-manager.js';
import { MILITARY_UNIT_TYPE, } from '../domain/war/components/war.components.js';
import { WAR_MOVE_ORDERED_EVENT, WAR_PEACE_REQUESTED_EVENT, } from '../domain/war/events/war.events.js';
/**
 * Framework-agnostic Headless API Gateway Router for GeoPolis Engine.
 * Translates external REST requests into Engine queries, action emissions, and save/load calls.
 */
export class APIGatewayRouter {
    engine;
    systems;
    baseSeed;
    parser = new StrictIntentParser();
    constructor(config) {
        this.engine = config.engine;
        this.systems = config.systems ?? [];
        if (config.baseSeed) {
            this.baseSeed = config.baseSeed;
        }
    }
    /**
     * Dispatch an incoming gateway HTTP request payload to the appropriate controller route.
     */
    async dispatch(request) {
        const { path, method, payload } = request;
        try {
            if (path === '/api/v1/state' && method === 'GET') {
                return this.handleGetState();
            }
            if (path === '/api/v1/tick' && method === 'POST') {
                return this.handlePostTick((payload ?? {}));
            }
            if (path === '/api/v1/action' && method === 'POST') {
                return this.handlePostAction((payload ?? {}));
            }
            if (path === '/api/v1/save' && method === 'POST') {
                return this.handlePostSave();
            }
            if (path === '/api/v1/load' && method === 'POST') {
                return this.handlePostLoad((payload ?? {}));
            }
            if (path === '/api/v1/byod/prompt' && method === 'POST') {
                return this.handlePostByodPrompt((payload ?? {}));
            }
            if (path === '/api/v1/byod/load' && method === 'POST') {
                return this.handlePostByodLoad(payload);
            }
            if (path === '/api/v1/scenarios' && method === 'GET') {
                return this.handleGetScenarios();
            }
            if (path === '/api/v1/scenarios/load' && method === 'POST') {
                return this.handlePostScenariosLoad(payload);
            }
            if (path === '/api/v1/entities' && method === 'GET') {
                return this.handleGetEntities();
            }
            if (path === '/api/v1/provinces' && method === 'GET') {
                return this.handleGetProvinces();
            }
            if (path === '/api/v1/achievements/unlock' && method === 'POST') {
                return this.handlePostAchievementsUnlock(payload);
            }
            if (path === '/api/v1/military/state' && method === 'GET') {
                return this.handleGetMilitaryState();
            }
            if (path === '/api/v1/military/move' && method === 'POST') {
                return this.handlePostMilitaryMove(payload);
            }
            if (path === '/api/v1/military/deploy' && method === 'POST') {
                return this.handlePostMilitaryDeploy(payload);
            }
            if (path === '/api/v1/military/peace' && method === 'POST') {
                return this.handlePostMilitaryPeace(payload);
            }
            return {
                statusCode: 404,
                success: false,
                error: `Route not found: ${method} ${path}`,
            };
        }
        catch (err) {
            return {
                statusCode: 500,
                success: false,
                error: err instanceof Error ? err.message : 'Internal Server Error',
            };
        }
    }
    handleGetState() {
        const worldState = this.engine.getWorldState();
        const metadata = worldState.getMetadata();
        // Default to perception dump for country-us or first entity
        const focalId = worldState.hasEntity('country-us') ? 'country-us' : undefined;
        const perceptionYaml = focalId ? PerceptionFilter.generatePerceptionDump(worldState, focalId) : undefined;
        const entities = {};
        for (const eid of worldState.getEntityIds()) {
            const entity = worldState.getEntity(eid);
            if (!entity)
                continue;
            const position = entity.getComponent(GEO_POSITION_TYPE);
            const components = {};
            for (const type of entity.getComponentTypes()) {
                if (type === GEO_POSITION_TYPE || type === GEO_PROVINCE_TYPE)
                    continue;
                const comp = entity.getComponent(type);
                if (comp)
                    components[type] = comp;
            }
            entities[eid] = {
                id: eid,
                name: eid,
                entityType: 'country',
                position: position ? { lat: position.lat, lng: position.lng } : undefined,
                components,
            };
        }
        const provinces = {};
        for (const eid of worldState.getEntityIds()) {
            const entity = worldState.getEntity(eid);
            if (!entity)
                continue;
            const provComponent = entity.getComponent(GEO_PROVINCE_TYPE);
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
    handlePostTick(payload) {
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
    handlePostAction(payload) {
        const validation = this.parser.validate({
            actionType: payload.actionType,
            actorEntityId: payload.actorEntityId,
            ...(payload.targetEntityId !== undefined ? { targetEntityId: payload.targetEntityId } : {}),
            parameters: payload.parameters ?? {},
            ...(payload.narrativeSummary !== undefined ? { narrativeSummary: payload.narrativeSummary } : {}),
        }, this.engine.getCurrentTick());
        if (!validation.isValid || !validation.validatedPayload) {
            return {
                statusCode: 400,
                success: false,
                error: `Action validation failed: ${validation.errors?.join('; ')}`,
            };
        }
        const eventBus = this.engine.getEventBus();
        const eventId = eventBus.publish(validation.validatedPayload.actionType, validation.validatedPayload.parameters, 'gateway.api', validation.validatedPayload.actorEntityId);
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
    handlePostSave() {
        const savePayload = SaveGameSerializer.createSaveGame(this.engine);
        return {
            statusCode: 200,
            success: true,
            data: savePayload,
        };
    }
    handlePostLoad(payload) {
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
    handlePostByodPrompt(payload) {
        const prompt = SeedPromptGenerator.generateInitializationPrompt(payload.campaignStartDate);
        return {
            statusCode: 200,
            success: true,
            data: { prompt },
        };
    }
    handlePostByodLoad(deltaPatch) {
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
    handleGetScenarios() {
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
    handleGetEntities() {
        const worldState = this.engine.getWorldState();
        const entities = {};
        for (const eid of worldState.getEntityIds()) {
            const entity = worldState.getEntity(eid);
            if (!entity)
                continue;
            const position = entity.getComponent(GEO_POSITION_TYPE);
            const components = {};
            for (const type of entity.getComponentTypes()) {
                if (type === GEO_POSITION_TYPE || type === GEO_PROVINCE_TYPE)
                    continue;
                const comp = entity.getComponent(type);
                if (comp)
                    components[type] = comp;
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
    handleGetProvinces() {
        const worldState = this.engine.getWorldState();
        const provinces = {};
        for (const eid of worldState.getEntityIds()) {
            const entity = worldState.getEntity(eid);
            if (!entity)
                continue;
            const provComponent = entity.getComponent(GEO_PROVINCE_TYPE);
            if (provComponent) {
                provinces[eid] = provComponent.provinces;
            }
        }
        return { statusCode: 200, success: true, data: provinces };
    }
    handlePostAchievementsUnlock(payload) {
        const req = payload;
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
    handlePostScenariosLoad(payload) {
        const req = payload;
        const scenarioPath = req?.scenarioPath;
        if (!scenarioPath) {
            return {
                statusCode: 400,
                success: false,
                error: 'scenarioPath is required in payload',
            };
        }
        const loader = new ScenarioLoader();
        const result = loader.loadFromFile(scenarioPath, { systems: this.systems });
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
    handleGetMilitaryState() {
        const worldState = this.engine.getWorldState();
        const units = [];
        for (const eid of worldState.getEntityIds()) {
            const entity = worldState.getEntity(eid);
            if (!entity)
                continue;
            const mil = entity.getComponent(MILITARY_UNIT_TYPE);
            if (!mil)
                continue;
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
        const provincesByOwner = {};
        for (const eid of worldState.getEntityIds()) {
            const entity = worldState.getEntity(eid);
            if (!entity)
                continue;
            const provComponent = entity.getComponent(GEO_PROVINCE_TYPE);
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
    handlePostMilitaryMove(payload) {
        const req = payload;
        if (!req?.unitId || !req?.targetProvinceId) {
            return {
                statusCode: 400,
                success: false,
                error: 'unitId and targetProvinceId are required',
            };
        }
        const worldState = this.engine.getWorldState();
        if (!worldState.hasEntity(req.unitId)) {
            return {
                statusCode: 404,
                success: false,
                error: `Unit not found: ${req.unitId}`,
            };
        }
        const entity = worldState.getEntity(req.unitId);
        const mil = entity?.getComponent(MILITARY_UNIT_TYPE);
        if (!mil) {
            return {
                statusCode: 400,
                success: false,
                error: `Entity ${req.unitId} is not a military unit`,
            };
        }
        const eventBus = this.engine.getEventBus();
        const eventId = eventBus.publish(WAR_MOVE_ORDERED_EVENT, { unitId: req.unitId, targetProvinceId: req.targetProvinceId }, 'gateway.api', req.unitId);
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
    handlePostMilitaryDeploy(payload) {
        const req = payload;
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
        const unitId = `unit-${req.countryId}-${req.provinceId}-${Date.now()}`;
        if (worldState.hasEntity(unitId)) {
            return {
                statusCode: 409,
                success: false,
                error: `Unit ID collision: ${unitId}`,
            };
        }
        const milComponent = {
            type: MILITARY_UNIT_TYPE,
            ownerCountryId: req.countryId,
            unitName: req.unitName,
            personnel: req.personnel,
            readiness: 0.9,
            morale: 0.85,
            fuelReserves: 100,
            currentProvinceId: req.provinceId,
        };
        worldState.createEntity(unitId, [milComponent]);
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
    handlePostMilitaryPeace(payload) {
        const req = payload;
        if (!req?.initiator || !req?.target) {
            return {
                statusCode: 400,
                success: false,
                error: 'initiator and target are required',
            };
        }
        const eventBus = this.engine.getEventBus();
        const eventId = eventBus.publish(WAR_PEACE_REQUESTED_EVENT, {
            initiator: req.initiator,
            target: req.target,
            returnProvinces: req.returnProvinces,
        }, 'gateway.api', req.initiator);
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
}
//# sourceMappingURL=gateway-router.js.map