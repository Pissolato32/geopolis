import { EntityId } from '../../../core/interfaces/entity.interface.js';
import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import {
  DIPLOMATIC_RELATION_TYPE,
  RelationComponent,
} from '../components/relation.component.js';
import {
  DIPLOMACY_TENSION_CHANGED_EVENT,
  IDiplomacyTensionChangedPayload,
} from '../events/diplomacy.events.js';

export const DIPLOMACY_SYSTEM_ID = 'diplomacy.system';

/**
 * ECS System responsible for resolving inter-state relation graphs per tick.
 * Priority: 400 (executes after politics, resolves relation graph dynamics).
 */
export class DiplomacySystem implements ISystem {
  readonly descriptor = {
    id: DIPLOMACY_SYSTEM_ID,
    name: 'Diplomatic Relations System',
    priority: 400 as SystemPriority,
    requiredComponents: [DIPLOMATIC_RELATION_TYPE],
    subscribedEvents: [DIPLOMACY_TENSION_CHANGED_EVENT],
    emittedEvents: [DIPLOMACY_TENSION_CHANGED_EVENT],
  };

  initialize(eventBus: IEventBus, worldState?: IWorldState): void {
    if (!worldState) return;
    eventBus.subscribe<IDiplomacyTensionChangedPayload>(
      DIPLOMACY_TENSION_CHANGED_EVENT,
      (event) => {
        const sourceId = event.payload.sourceCountryId as EntityId;
        if (worldState.hasEntity(sourceId)) {
          const entity = worldState.getEntity(sourceId);
          const currentComp = entity?.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
          if (currentComp) {
            worldState.updateComponent(sourceId, {
              ...currentComp,
              tension: event.payload.newTension,
            } as unknown as IComponent);
          }
        }
      },
    );
  }

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const countries = state.getEntitiesByComponent(DIPLOMATIC_RELATION_TYPE);

    for (const country of countries) {
      const relation = country.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
      if (!relation) continue;

      // Natural tension decay/escalation based on affinity
      const tensionDrift = relation.affinity < 0 ? 0.005 : -0.002;
      const newTension = Math.min(1.0, Math.max(0.0, relation.tension + tensionDrift));

      eventBus.publish<IDiplomacyTensionChangedPayload>(
        DIPLOMACY_TENSION_CHANGED_EVENT,
        {
          sourceCountryId: country.id,
          targetCountryId: relation.targetCountryId,
          previousTension: relation.tension,
          newTension,
          affinity: relation.affinity,
        },
        DIPLOMACY_SYSTEM_ID,
        country.id,
      );
    }
  }
}
