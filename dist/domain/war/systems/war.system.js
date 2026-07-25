import { MILITARY_UNIT_TYPE, } from '../components/war.components.js';
import { WAR_FUEL_CONSUMED_EVENT, WAR_FUEL_DEPLETED_EVENT, } from '../events/war.events.js';
export const WAR_SYSTEM_ID = 'war.system';
/**
 * ECS System responsible for military unit maintenance, fuel consumption, and combat readiness per tick.
 * Priority: 500 (executes after diplomacy).
 */
export class WarSystem {
    descriptor = {
        id: WAR_SYSTEM_ID,
        name: 'Military & Logistics System',
        priority: 500,
        requiredComponents: [MILITARY_UNIT_TYPE],
        subscribedEvents: [WAR_FUEL_CONSUMED_EVENT],
        emittedEvents: [WAR_FUEL_CONSUMED_EVENT, WAR_FUEL_DEPLETED_EVENT],
    };
    initialize(eventBus, worldState) {
        if (!worldState)
            return;
        eventBus.subscribe(WAR_FUEL_CONSUMED_EVENT, (event) => {
            const unitId = event.payload.unitId;
            if (worldState.hasEntity(unitId)) {
                const entity = worldState.getEntity(unitId);
                const currentComp = entity?.getComponent(MILITARY_UNIT_TYPE);
                if (currentComp) {
                    worldState.updateComponent(unitId, {
                        ...currentComp,
                        fuelReserves: event.payload.newFuel,
                    });
                }
            }
        });
    }
    execute(state, eventBus) {
        const units = state.getEntitiesByComponent(MILITARY_UNIT_TYPE);
        for (const unit of units) {
            const militaryComp = unit.getComponent(MILITARY_UNIT_TYPE);
            if (!militaryComp)
                continue;
            const newFuel = Math.max(0, militaryComp.fuelReserves - 2);
            // Publish event for event resolution phase (no direct state mutation in execute)
            eventBus.publish(WAR_FUEL_CONSUMED_EVENT, {
                unitId: unit.id,
                previousFuel: militaryComp.fuelReserves,
                newFuel,
            }, WAR_SYSTEM_ID, unit.id);
            if (newFuel === 0) {
                eventBus.publish(WAR_FUEL_DEPLETED_EVENT, {
                    unitId: unit.id,
                    remainingFuel: 0,
                    readinessPenalty: 0.1,
                }, WAR_SYSTEM_ID, unit.id);
            }
        }
    }
}
//# sourceMappingURL=war.system.js.map