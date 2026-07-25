import { DIPLOMATIC_RELATION_TYPE, } from '../components/relation.component.js';
import { DIPLOMACY_TENSION_CHANGED_EVENT, } from '../events/diplomacy.events.js';
export const DIPLOMACY_SYSTEM_ID = 'diplomacy.system';
/**
 * ECS System responsible for resolving inter-state relation graphs per tick.
 * Priority: 400 (executes after politics, resolves relation graph dynamics).
 */
export class DiplomacySystem {
    descriptor = {
        id: DIPLOMACY_SYSTEM_ID,
        name: 'Diplomatic Relations System',
        priority: 400,
        requiredComponents: [DIPLOMATIC_RELATION_TYPE],
        subscribedEvents: [DIPLOMACY_TENSION_CHANGED_EVENT],
        emittedEvents: [DIPLOMACY_TENSION_CHANGED_EVENT],
    };
    initialize(eventBus, worldState) {
        if (!worldState)
            return;
        eventBus.subscribe(DIPLOMACY_TENSION_CHANGED_EVENT, (event) => {
            const sourceId = event.payload.sourceCountryId;
            if (worldState.hasEntity(sourceId)) {
                const entity = worldState.getEntity(sourceId);
                const currentComp = entity?.getComponent(DIPLOMATIC_RELATION_TYPE);
                if (currentComp) {
                    worldState.updateComponent(sourceId, {
                        ...currentComp,
                        tension: event.payload.newTension,
                    });
                }
            }
        });
    }
    execute(state, eventBus) {
        const countries = state.getEntitiesByComponent(DIPLOMATIC_RELATION_TYPE);
        for (const country of countries) {
            const relation = country.getComponent(DIPLOMATIC_RELATION_TYPE);
            if (!relation)
                continue;
            // Natural tension decay/escalation based on affinity
            const tensionDrift = relation.affinity < 0 ? 0.005 : -0.002;
            const newTension = Math.min(1.0, Math.max(0.0, relation.tension + tensionDrift));
            eventBus.publish(DIPLOMACY_TENSION_CHANGED_EVENT, {
                sourceCountryId: country.id,
                targetCountryId: relation.targetCountryId,
                previousTension: relation.tension,
                newTension,
                affinity: relation.affinity,
            }, DIPLOMACY_SYSTEM_ID, country.id);
        }
    }
}
//# sourceMappingURL=diplomacy.system.js.map