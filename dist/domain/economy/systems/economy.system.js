import { ECONOMIC_INDICATOR_TYPE, RESOURCE_PRODUCTION_TYPE, } from '../components/economy.components.js';
import { ECONOMY_GDP_UPDATED_EVENT, ECONOMY_RESOURCE_SHORTAGE_EVENT, } from '../events/economy.events.js';
export const ECONOMY_SYSTEM_ID = 'economy.system';
/**
 * ECS System responsible for economic simulation per tick.
 * Priority: 200 (runs after resource extraction, before politics/diplomacy).
 */
export class EconomySystem {
    descriptor = {
        id: ECONOMY_SYSTEM_ID,
        name: 'Economy Simulation System',
        priority: 200,
        requiredComponents: [ECONOMIC_INDICATOR_TYPE],
        subscribedEvents: [ECONOMY_GDP_UPDATED_EVENT],
        emittedEvents: [ECONOMY_GDP_UPDATED_EVENT, ECONOMY_RESOURCE_SHORTAGE_EVENT],
    };
    initialize(eventBus, worldState) {
        if (!worldState)
            return;
        eventBus.subscribe(ECONOMY_GDP_UPDATED_EVENT, (event) => {
            const countryId = event.payload.countryId;
            if (worldState.hasEntity(countryId)) {
                const entity = worldState.getEntity(countryId);
                const currentComp = entity?.getComponent(ECONOMIC_INDICATOR_TYPE);
                if (currentComp) {
                    worldState.updateComponent(countryId, {
                        ...currentComp,
                        gdp: event.payload.newGdp,
                    });
                }
            }
        });
    }
    execute(state, eventBus) {
        const countries = state.getEntitiesByComponent(ECONOMIC_INDICATOR_TYPE);
        for (const country of countries) {
            const indicator = country.getComponent(ECONOMIC_INDICATOR_TYPE);
            if (!indicator)
                continue;
            const production = country.getComponent(RESOURCE_PRODUCTION_TYPE);
            const totalOutput = production
                ? production.industrialOutput + production.energyOutput * 0.5
                : 100;
            const currentGdp = typeof indicator.gdp === 'bigint' ? Number(indicator.gdp) : indicator.gdp;
            // Base GDP calculation with production capacity impact
            const growthFactor = (totalOutput / 500) * 0.001 - indicator.inflationRate * 0.0005;
            const newGdp = Math.max(1, currentGdp * (1 + growthFactor));
            eventBus.publish(ECONOMY_GDP_UPDATED_EVENT, {
                countryId: country.id,
                previousGdp: indicator.gdp,
                newGdp,
                gdpGrowthRate: growthFactor,
            }, ECONOMY_SYSTEM_ID, country.id);
            // Check for energy resource shortage
            if (production && production.energyOutput < 20) {
                eventBus.publish(ECONOMY_RESOURCE_SHORTAGE_EVENT, {
                    countryId: country.id,
                    resourceType: 'energy',
                    deficit: 20 - production.energyOutput,
                }, ECONOMY_SYSTEM_ID, country.id);
            }
        }
    }
}
//# sourceMappingURL=economy.system.js.map