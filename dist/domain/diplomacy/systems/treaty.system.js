import { DIPLOMATIC_RELATION_TYPE, } from '../components/relation.component.js';
import { DIPLOMACY_TENSION_CHANGED_EVENT, DIPLOMACY_TREATY_SIGNED_EVENT, } from '../events/diplomacy.events.js';
export const TREATY_SYSTEM_ID = 'diplomacy.treaty';
export class TreatySystem {
    descriptor = {
        id: TREATY_SYSTEM_ID,
        name: 'Treaty Resolution System',
        priority: 350,
        requiredComponents: [DIPLOMATIC_RELATION_TYPE],
        subscribedEvents: [DIPLOMACY_TREATY_SIGNED_EVENT],
        emittedEvents: [DIPLOMACY_TENSION_CHANGED_EVENT],
    };
    initialize(eventBus, worldState) {
        if (!worldState)
            return;
        eventBus.subscribe(DIPLOMACY_TREATY_SIGNED_EVENT, (event) => {
            const signatories = event.payload.signatories;
            const treatyType = event.payload.treatyType;
            for (const sourceId of signatories) {
                for (const targetId of signatories) {
                    if (sourceId === targetId)
                        continue;
                    const sourceEntity = worldState.getEntity(sourceId);
                    const rel = sourceEntity?.getComponent(DIPLOMATIC_RELATION_TYPE);
                    if (!rel || rel.targetCountryId !== targetId)
                        continue;
                    const newTension = treatyType === 'defense' ? Math.max(0, rel.tension - 0.15)
                        : treatyType === 'non-aggression' ? Math.max(0, rel.tension - 0.2)
                            : Math.max(0, rel.tension - 0.05);
                    const newAffinity = treatyType === 'defense' ? Math.min(1, rel.affinity + 0.1)
                        : treatyType === 'non-aggression' ? Math.min(1, rel.affinity + 0.05)
                            : Math.min(1, rel.affinity + 0.15);
                    const updatedTreaties = [...rel.activeTreaties, event.payload.treatyId];
                    worldState.updateComponent(sourceId, {
                        ...rel,
                        tension: newTension,
                        affinity: newAffinity,
                        activeTreaties: updatedTreaties,
                    });
                    eventBus.publish(DIPLOMACY_TENSION_CHANGED_EVENT, {
                        sourceCountryId: sourceId,
                        targetCountryId: targetId,
                        previousTension: rel.tension,
                        newTension,
                        affinity: newAffinity,
                    }, TREATY_SYSTEM_ID, sourceId);
                }
            }
        });
    }
    execute(_state, _eventBus) {
    }
}
//# sourceMappingURL=treaty.system.js.map