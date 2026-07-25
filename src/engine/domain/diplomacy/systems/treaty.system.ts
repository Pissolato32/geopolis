import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import {
  DIPLOMATIC_RELATION_TYPE,
  RelationComponent,
} from '../components/relation.component.js';
import {
  DIPLOMACY_TENSION_CHANGED_EVENT,
  DIPLOMACY_TREATY_SIGNED_EVENT,
  IDiplomacyTensionChangedPayload,
  IDiplomacyTreatySignedPayload,
} from '../events/diplomacy.events.js';

export const TREATY_SYSTEM_ID = 'diplomacy.treaty';

export class TreatySystem implements ISystem {
  readonly descriptor = {
    id: TREATY_SYSTEM_ID,
    name: 'Treaty Resolution System',
    priority: 350 as SystemPriority,
    requiredComponents: [DIPLOMATIC_RELATION_TYPE],
    subscribedEvents: [DIPLOMACY_TREATY_SIGNED_EVENT],
    emittedEvents: [DIPLOMACY_TENSION_CHANGED_EVENT],
  };

  initialize(eventBus: IEventBus, worldState?: IWorldState): void {
    if (!worldState) return;

    eventBus.subscribe<IDiplomacyTreatySignedPayload>(
      DIPLOMACY_TREATY_SIGNED_EVENT,
      (event) => {
        const signatories = event.payload.signatories;
        const treatyType = event.payload.treatyType;

        for (const sourceId of signatories) {
          for (const targetId of signatories) {
            if (sourceId === targetId) continue;

            const sourceEntity = worldState.getEntity(sourceId as EntityId);
            const rel = sourceEntity?.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
            if (!rel || rel.targetCountryId !== targetId) continue;

            const newTension = treatyType === 'defense' ? Math.max(0, rel.tension - 0.15)
              : treatyType === 'non-aggression' ? Math.max(0, rel.tension - 0.2)
              : Math.max(0, rel.tension - 0.05);

            const newAffinity = treatyType === 'defense' ? Math.min(1, rel.affinity + 0.1)
              : treatyType === 'non-aggression' ? Math.min(1, rel.affinity + 0.05)
              : Math.min(1, rel.affinity + 0.15);

            const updatedTreaties = [...rel.activeTreaties, event.payload.treatyId];

            worldState.updateComponent(sourceId as EntityId, {
              ...rel,
              tension: newTension,
              affinity: newAffinity,
              activeTreaties: updatedTreaties,
            } as unknown as IComponent);

            eventBus.publish<IDiplomacyTensionChangedPayload>(
              DIPLOMACY_TENSION_CHANGED_EVENT,
              {
                sourceCountryId: sourceId,
                targetCountryId: targetId,
                previousTension: rel.tension,
                newTension,
                affinity: newAffinity,
              },
              TREATY_SYSTEM_ID,
              sourceId as EntityId,
            );
          }
        }
      },
    );
  }

  execute(_state: Readonly<IWorldState>, _eventBus: IEventBus): void {
  }
}
