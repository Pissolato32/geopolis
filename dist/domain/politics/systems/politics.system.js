import { GOVERNMENT_STABILITY_TYPE, } from '../components/politics.components.js';
import { POLITICS_STABILITY_CHANGED_EVENT, POLITICS_COUP_RISK_EVENT, } from '../events/politics.events.js';
import { ECONOMY_RESOURCE_SHORTAGE_EVENT } from '../../economy/events/economy.events.js';
export const POLITICS_SYSTEM_ID = 'politics.system';
/**
 * ECS System responsible for political stability, faction dynamics, and coup risk per tick.
 * Priority: 300 (executes after economy, reacts to resource shortages via events).
 */
export class PoliticsSystem {
    descriptor = {
        id: POLITICS_SYSTEM_ID,
        name: 'Politics & Stability System',
        priority: 300,
        requiredComponents: [GOVERNMENT_STABILITY_TYPE],
        subscribedEvents: [ECONOMY_RESOURCE_SHORTAGE_EVENT],
        emittedEvents: [POLITICS_STABILITY_CHANGED_EVENT, POLITICS_COUP_RISK_EVENT],
    };
    pendingShortageImpacts = new Map();
    initialize(eventBus, worldState) {
        // Subscribe to economic shortages to reduce political stability
        eventBus.subscribe(ECONOMY_RESOURCE_SHORTAGE_EVENT, (event) => {
            const currentImpact = this.pendingShortageImpacts.get(event.payload.countryId) ?? 0;
            this.pendingShortageImpacts.set(event.payload.countryId, currentImpact + 0.02);
        });
        if (worldState) {
            eventBus.subscribe(POLITICS_STABILITY_CHANGED_EVENT, (event) => {
                const countryId = event.payload.countryId;
                if (worldState.hasEntity(countryId)) {
                    const entity = worldState.getEntity(countryId);
                    const currentComp = entity?.getComponent(GOVERNMENT_STABILITY_TYPE);
                    if (currentComp) {
                        worldState.updateComponent(countryId, {
                            ...currentComp,
                            stabilityIndex: event.payload.newStability,
                        });
                    }
                }
            });
        }
    }
    execute(state, eventBus) {
        const countries = state.getEntitiesByComponent(GOVERNMENT_STABILITY_TYPE);
        for (const country of countries) {
            const stabilityComp = country.getComponent(GOVERNMENT_STABILITY_TYPE);
            if (!stabilityComp)
                continue;
            const shortagePenalty = this.pendingShortageImpacts.get(country.id) ?? 0;
            const naturalDrift = (stabilityComp.approvalRating - 0.5) * 0.01;
            const totalDelta = naturalDrift - shortagePenalty;
            const newStability = Math.min(1.0, Math.max(0.0, stabilityComp.stabilityIndex + totalDelta));
            eventBus.publish(POLITICS_STABILITY_CHANGED_EVENT, {
                countryId: country.id,
                previousStability: stabilityComp.stabilityIndex,
                newStability,
                delta: totalDelta,
            }, POLITICS_SYSTEM_ID, country.id);
            // Evaluate coup risk
            if (newStability < 0.35 || stabilityComp.militaryLoyalty < 0.4) {
                eventBus.publish(POLITICS_COUP_RISK_EVENT, {
                    countryId: country.id,
                    stabilityIndex: newStability,
                    militaryLoyalty: stabilityComp.militaryLoyalty,
                    riskLevel: newStability < 0.2 ? 'critical' : 'moderate',
                }, POLITICS_SYSTEM_ID, country.id);
            }
        }
        // Reset temporary impact buffer for next tick
        this.pendingShortageImpacts.clear();
    }
}
//# sourceMappingURL=politics.system.js.map