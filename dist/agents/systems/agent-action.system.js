import { GOVERNMENT_STABILITY_TYPE, } from '../../domain/politics/components/politics.components.js';
import { POLITICS_STABILITY_CHANGED_EVENT, } from '../../domain/politics/events/politics.events.js';
import { ECONOMIC_INDICATOR_TYPE, } from '../../domain/economy/components/economy.components.js';
import { ECONOMY_TRADE_ROUTE_TYPE, } from '../../domain/economy/components/trade.components.js';
import { ECONOMY_SANCTION_TYPE, } from '../../domain/economy/components/sanction.components.js';
import { ECONOMY_TRADE_ROUTE_ESTABLISHED_EVENT, ECONOMY_TRADE_ROUTE_BLOCKED_EVENT, } from '../../domain/economy/events/trade.events.js';
import { ECONOMY_SANCTION_IMPOSED_EVENT, ECONOMY_SANCTION_LIFTED_EVENT, } from '../../domain/economy/events/sanction.events.js';
import { MILITARY_UNIT_TYPE, } from '../../domain/war/components/war.components.js';
export const AGENT_ACTION_SYSTEM_ID = 'agent.action-resolver';
export class AgentActionSystem {
    descriptor = {
        id: AGENT_ACTION_SYSTEM_ID,
        name: 'Agent Action Resolver System',
        priority: 50,
        requiredComponents: [],
        subscribedEvents: [
            'politics.maintain-stability',
            'economy.invest',
            'economy.establish-trade-route',
            'economy.close-trade-route',
            'economy.impose-sanction',
            'economy.lift-sanction',
            'military.deploy-unit',
        ],
        emittedEvents: [
            POLITICS_STABILITY_CHANGED_EVENT,
            ECONOMY_TRADE_ROUTE_ESTABLISHED_EVENT,
            ECONOMY_TRADE_ROUTE_BLOCKED_EVENT,
            ECONOMY_SANCTION_IMPOSED_EVENT,
            ECONOMY_SANCTION_LIFTED_EVENT,
        ],
    };
    initialize(eventBus, worldState) {
        if (!worldState)
            return;
        eventBus.subscribe('politics.maintain-stability', (event) => {
            const countryId = event.entityId;
            if (!countryId || !worldState.hasEntity(countryId))
                return;
            const entity = worldState.getEntity(countryId);
            const comp = entity?.getComponent(GOVERNMENT_STABILITY_TYPE);
            if (!comp)
                return;
            const newStability = Math.min(1.0, comp.stabilityIndex + 0.03);
            worldState.updateComponent(countryId, {
                ...comp,
                stabilityIndex: newStability,
            });
            eventBus.publish(POLITICS_STABILITY_CHANGED_EVENT, {
                countryId,
                previousStability: comp.stabilityIndex,
                newStability,
                delta: 0.03,
            }, AGENT_ACTION_SYSTEM_ID, countryId);
        });
        eventBus.subscribe('economy.invest', (event) => {
            const countryId = event.entityId;
            if (!countryId || !worldState.hasEntity(countryId))
                return;
            const entity = worldState.getEntity(countryId);
            const indicator = entity?.getComponent(ECONOMIC_INDICATOR_TYPE);
            if (!indicator)
                return;
            const gdpVal = typeof indicator.gdp === 'bigint' ? Number(indicator.gdp) : indicator.gdp;
            const newGdp = gdpVal * 1.01;
            worldState.updateComponent(countryId, {
                ...indicator,
                gdp: typeof indicator.gdp === 'bigint' ? BigInt(Math.round(newGdp)) : newGdp,
            });
        });
        eventBus.subscribe('economy.establish-trade-route', (event) => {
            const countryId = event.entityId;
            if (!countryId || !worldState.hasEntity(countryId))
                return;
            const params = event.payload;
            const targetId = params['targetCountryId'];
            if (!targetId || !worldState.hasEntity(targetId))
                return;
            const resourceType = params['resourceType'];
            const volume = params['volumePerTick'];
            if (!resourceType || !volume)
                return;
            const routeId = `route-${countryId}-${targetId}-${resourceType}-${Date.now()}`;
            if (worldState.hasEntity(routeId))
                return;
            worldState.createEntity(routeId, [
                {
                    type: ECONOMY_TRADE_ROUTE_TYPE,
                    sourceCountryId: countryId,
                    targetCountryId: targetId,
                    resourceType,
                    volumePerTick: volume,
                    isActive: true,
                    establishedTick: worldState.getMetadata().currentTick,
                },
            ]);
            eventBus.publish(ECONOMY_TRADE_ROUTE_ESTABLISHED_EVENT, {
                routeId,
                sourceCountryId: countryId,
                targetCountryId: targetId,
                resourceType,
                volumePerTick: volume,
            }, AGENT_ACTION_SYSTEM_ID, countryId);
        });
        eventBus.subscribe('economy.close-trade-route', (event) => {
            const countryId = event.entityId;
            if (!countryId || !worldState.hasEntity(countryId))
                return;
            const params = event.payload;
            const routeId = params['routeId'];
            if (!routeId || !worldState.hasEntity(routeId))
                return;
            const routeEntity = worldState.getEntity(routeId);
            const route = routeEntity?.getComponent(ECONOMY_TRADE_ROUTE_TYPE);
            if (!route || !route.isActive)
                return;
            worldState.updateComponent(routeId, {
                ...route,
                isActive: false,
            });
            eventBus.publish(ECONOMY_TRADE_ROUTE_BLOCKED_EVENT, {
                routeId,
                sourceCountryId: route.sourceCountryId,
                targetCountryId: route.targetCountryId,
                reason: 'diplomatic-freeze',
            }, AGENT_ACTION_SYSTEM_ID, countryId);
        });
        eventBus.subscribe('economy.impose-sanction', (event) => {
            const countryId = event.entityId;
            if (!countryId || !worldState.hasEntity(countryId))
                return;
            const params = event.payload;
            const targetId = params['targetCountryId'];
            if (!targetId || !worldState.hasEntity(targetId))
                return;
            const sanctionType = params['sanctionType'];
            const severity = params['severity'];
            if (!sanctionType)
                return;
            const existingSanctions = worldState.getEntitiesByComponent(ECONOMY_SANCTION_TYPE);
            for (const s of existingSanctions) {
                const comp = s.getComponent(ECONOMY_SANCTION_TYPE);
                if (comp && comp.sourceCountryId === countryId && comp.targetCountryId === targetId && comp.sanctionType === sanctionType) {
                    return;
                }
            }
            const sanctionId = `sanction-${countryId}-${targetId}-${sanctionType}-${Date.now()}`;
            worldState.createEntity(sanctionId, [
                {
                    type: ECONOMY_SANCTION_TYPE,
                    sourceCountryId: countryId,
                    targetCountryId: targetId,
                    sanctionType,
                    severity: severity ?? 0.5,
                    startTick: worldState.getMetadata().currentTick,
                },
            ]);
            eventBus.publish(ECONOMY_SANCTION_IMPOSED_EVENT, {
                sanctionId,
                sourceCountryId: countryId,
                targetCountryId: targetId,
                sanctionType,
                severity: severity ?? 0.5,
            }, AGENT_ACTION_SYSTEM_ID, countryId);
        });
        eventBus.subscribe('economy.lift-sanction', (event) => {
            const countryId = event.entityId;
            if (!countryId || !worldState.hasEntity(countryId))
                return;
            const params = event.payload;
            const sanctionId = params['sanctionId'];
            if (!sanctionId || !worldState.hasEntity(sanctionId))
                return;
            const sanctionEntity = worldState.getEntity(sanctionId);
            const sanction = sanctionEntity?.getComponent(ECONOMY_SANCTION_TYPE);
            if (!sanction)
                return;
            worldState.removeEntity(sanctionId);
            eventBus.publish(ECONOMY_SANCTION_LIFTED_EVENT, {
                sanctionId,
                sourceCountryId: sanction.sourceCountryId,
                targetCountryId: sanction.targetCountryId,
                sanctionType: sanction.sanctionType,
            }, AGENT_ACTION_SYSTEM_ID, countryId);
        });
        eventBus.subscribe('military.deploy-unit', (event) => {
            const countryId = event.entityId;
            if (!countryId || !worldState.hasEntity(countryId))
                return;
            const unitId = `unit-${countryId}-${Date.now()}`;
            if (worldState.hasEntity(unitId))
                return;
            const params = event.payload;
            worldState.createEntity(unitId, [
                {
                    type: MILITARY_UNIT_TYPE,
                    ownerCountryId: countryId,
                    unitName: params['unitName'] ?? 'Deployed Force',
                    personnel: params['personnel'] ?? 5000,
                    readiness: 0.7,
                    morale: 0.8,
                    fuelReserves: 10,
                },
            ]);
        });
    }
    execute(_state, _eventBus) {
    }
}
//# sourceMappingURL=agent-action.system.js.map