import { GOVERNMENT_STABILITY_TYPE, } from '../components/politics.components.js';
import { POLITICS_COUP_RISK_EVENT, POLITICS_STABILITY_CHANGED_EVENT, } from '../events/politics.events.js';
export const COUP_SYSTEM_ID = 'politics.coup';
export class CoupSystem {
    descriptor = {
        id: COUP_SYSTEM_ID,
        name: 'Coup d\'État Resolution System',
        priority: 250,
        requiredComponents: [GOVERNMENT_STABILITY_TYPE],
        subscribedEvents: [POLITICS_COUP_RISK_EVENT],
        emittedEvents: [POLITICS_STABILITY_CHANGED_EVENT],
    };
    initialize(eventBus, worldState) {
        if (!worldState)
            return;
        eventBus.subscribe(POLITICS_COUP_RISK_EVENT, (event) => {
            if (event.payload.riskLevel !== 'critical')
                return;
            const countryId = event.payload.countryId;
            if (!worldState.hasEntity(countryId))
                return;
            const entity = worldState.getEntity(countryId);
            const currentComp = entity?.getComponent(GOVERNMENT_STABILITY_TYPE);
            if (!currentComp)
                return;
            worldState.updateComponent(countryId, {
                ...currentComp,
                stabilityIndex: 0.3,
                approvalRating: 0.35,
                militaryLoyalty: 0.6,
            });
            eventBus.publish(POLITICS_STABILITY_CHANGED_EVENT, {
                countryId,
                previousStability: currentComp.stabilityIndex,
                newStability: 0.3,
                delta: 0.3 - currentComp.stabilityIndex,
            }, COUP_SYSTEM_ID, countryId);
        });
    }
    execute(_state, _eventBus) {
    }
}
//# sourceMappingURL=coup.system.js.map