import { MILITARY_UNIT_TYPE, } from '../components/war.components.js';
import { WAR_UNIT_MOVED_EVENT, WAR_MOVE_ORDERED_EVENT, WAR_FUEL_CONSUMED_EVENT, } from '../events/war.events.js';
export const MOVEMENT_SYSTEM_ID = 'war.movement';
const GEO_PROVINCE_TYPE = 'geo.province';
const FUEL_PER_MOVE = 1;
export class MovementSystem {
    descriptor = {
        id: MOVEMENT_SYSTEM_ID,
        name: 'Military Movement System',
        priority: 475,
        requiredComponents: [MILITARY_UNIT_TYPE],
        subscribedEvents: [WAR_MOVE_ORDERED_EVENT, WAR_UNIT_MOVED_EVENT],
        emittedEvents: [WAR_UNIT_MOVED_EVENT, WAR_FUEL_CONSUMED_EVENT],
    };
    initialize(eventBus, worldState) {
        if (!worldState)
            return;
        eventBus.subscribe(WAR_MOVE_ORDERED_EVENT, (event) => {
            const unitId = event.payload.unitId;
            if (worldState.hasEntity(unitId)) {
                const entity = worldState.getEntity(unitId);
                const currentComp = entity?.getComponent(MILITARY_UNIT_TYPE);
                if (currentComp) {
                    worldState.updateComponent(unitId, {
                        ...currentComp,
                        moveTargetProvinceId: event.payload.targetProvinceId,
                        moveProgress: 0,
                    });
                }
            }
        });
        eventBus.subscribe(WAR_UNIT_MOVED_EVENT, (event) => {
            const unitId = event.payload.unitId;
            if (worldState.hasEntity(unitId)) {
                const entity = worldState.getEntity(unitId);
                const currentComp = entity?.getComponent(MILITARY_UNIT_TYPE);
                if (currentComp) {
                    const targetReached = currentComp.moveTargetProvinceId === event.payload.toProvinceId;
                    worldState.updateComponent(unitId, {
                        ...currentComp,
                        currentProvinceId: event.payload.toProvinceId,
                        moveProgress: targetReached ? 100 : Math.min((currentComp.moveProgress ?? 0) + 20, 99),
                        moveTargetProvinceId: targetReached ? undefined : currentComp.moveTargetProvinceId,
                    });
                }
            }
        });
    }
    execute(state, eventBus) {
        const units = state.getEntitiesByComponent(MILITARY_UNIT_TYPE);
        const provinceGraph = this.buildProvinceGraph(state);
        for (const unit of units) {
            const mil = unit.getComponent(MILITARY_UNIT_TYPE);
            if (!mil)
                continue;
            if (!mil.moveTargetProvinceId)
                continue;
            if (mil.fuelReserves <= 0)
                continue;
            const from = mil.currentProvinceId;
            const target = mil.moveTargetProvinceId;
            if (target === from) {
                eventBus.publish(WAR_UNIT_MOVED_EVENT, { unitId: unit.id, ownerCountryId: mil.ownerCountryId, fromProvinceId: from, toProvinceId: target }, MOVEMENT_SYSTEM_ID, unit.id);
                continue;
            }
            const neighbors = provinceGraph.get(from);
            if (!neighbors || neighbors.length === 0)
                continue;
            let nextProvinceId;
            if (neighbors.includes(target)) {
                nextProvinceId = target;
            }
            else {
                const step = this.bfsNextStep(from, target, provinceGraph);
                if (!step)
                    continue;
                nextProvinceId = step;
            }
            const newFuel = Math.max(0, mil.fuelReserves - FUEL_PER_MOVE);
            eventBus.publish(WAR_FUEL_CONSUMED_EVENT, { unitId: unit.id, previousFuel: mil.fuelReserves, newFuel }, MOVEMENT_SYSTEM_ID, unit.id);
            eventBus.publish(WAR_UNIT_MOVED_EVENT, {
                unitId: unit.id,
                ownerCountryId: mil.ownerCountryId,
                fromProvinceId: from,
                toProvinceId: nextProvinceId,
            }, MOVEMENT_SYSTEM_ID, unit.id);
        }
    }
    buildProvinceGraph(state) {
        const graph = new Map();
        for (const eid of state.getEntityIds()) {
            const entity = state.getEntity(eid);
            if (!entity)
                continue;
            const provComponent = entity.getComponent(GEO_PROVINCE_TYPE);
            if (!provComponent)
                continue;
            for (const prov of provComponent.provinces) {
                graph.set(prov.provinceId, prov.neighborIds);
            }
        }
        return graph;
    }
    bfsNextStep(from, target, graph) {
        const visited = new Set([from]);
        const queue = [];
        for (const neighbor of graph.get(from) ?? []) {
            if (neighbor === target)
                return target;
            queue.push({ id: neighbor, firstStep: neighbor });
            visited.add(neighbor);
        }
        while (queue.length > 0) {
            const current = queue.shift();
            if (current.id === target)
                return current.firstStep;
            for (const neighbor of graph.get(current.id) ?? []) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push({ id: neighbor, firstStep: current.firstStep });
                }
            }
        }
        return undefined;
    }
}
//# sourceMappingURL=movement.system.js.map