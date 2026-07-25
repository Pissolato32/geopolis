import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import {
  GOVERNMENT_STABILITY_TYPE,
  GovernmentStabilityComponent,
} from '../components/politics.components.js';
import {
  POLITICS_COUP_RISK_EVENT,
  POLITICS_STABILITY_CHANGED_EVENT,
  IPoliticsCoupRiskPayload,
  IPoliticsStabilityChangedPayload,
} from '../events/politics.events.js';

export const COUP_SYSTEM_ID = 'politics.coup';

export class CoupSystem implements ISystem {
  readonly descriptor = {
    id: COUP_SYSTEM_ID,
    name: 'Coup d\'État Resolution System',
    priority: 250 as SystemPriority,
    requiredComponents: [GOVERNMENT_STABILITY_TYPE],
    subscribedEvents: [POLITICS_COUP_RISK_EVENT],
    emittedEvents: [POLITICS_STABILITY_CHANGED_EVENT],
  };

  initialize(eventBus: IEventBus, worldState?: IWorldState): void {
    if (!worldState) return;

    eventBus.subscribe<IPoliticsCoupRiskPayload>(
      POLITICS_COUP_RISK_EVENT,
      (event) => {
        if (event.payload.riskLevel !== 'critical') return;

        const countryId = event.payload.countryId as EntityId;
        if (!worldState.hasEntity(countryId)) return;

        const entity = worldState.getEntity(countryId);
        const currentComp = entity?.getComponent<GovernmentStabilityComponent>(GOVERNMENT_STABILITY_TYPE);
        if (!currentComp) return;

        worldState.updateComponent(countryId, {
          ...currentComp,
          stabilityIndex: 0.3,
          approvalRating: 0.35,
          militaryLoyalty: 0.6,
        } as unknown as IComponent);

        eventBus.publish<IPoliticsStabilityChangedPayload>(
          POLITICS_STABILITY_CHANGED_EVENT,
          {
            countryId,
            previousStability: currentComp.stabilityIndex,
            newStability: 0.3,
            delta: 0.3 - currentComp.stabilityIndex,
          },
          COUP_SYSTEM_ID,
          countryId,
        );
      },
    );
  }

  execute(_state: Readonly<IWorldState>, _eventBus: IEventBus): void {
  }
}
