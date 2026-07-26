import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import {
  COMMODITY_IMPACT_TYPE,
  CommodityImpactComponent,
} from '../components/economy.components.js';
import {
  GOVERNMENT_STABILITY_TYPE,
  GovernmentStabilityComponent,
} from '../../politics/components/politics.components.js';
import {
  MILITARY_FORCES_TYPE,
  MilitaryForcesComponent,
} from '../../war/components/military-forces.component.js';
import {
  POLITICS_STABILITY_CHANGED_EVENT,
  IPoliticsStabilityChangedPayload,
} from '../../politics/events/politics.events.js';

export const COMMODITY_IMPACT_SYSTEM_ID = 'economy.commodity-impact';

const STABILITY_FLOOR = 0.0;
const STABILITY_CEILING = 1.0;

export class CommodityImpactSystem implements ISystem {
  readonly descriptor = {
    id: COMMODITY_IMPACT_SYSTEM_ID,
    name: 'Commodity Scarcity Impact System',
    priority: 190 as SystemPriority,
    requiredComponents: [COMMODITY_IMPACT_TYPE],
    subscribedEvents: [],
    emittedEvents: [POLITICS_STABILITY_CHANGED_EVENT],
  };

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const impactedCountries = state.getEntitiesByComponent(COMMODITY_IMPACT_TYPE);

    for (const country of impactedCountries) {
      const impact = country.getComponent<CommodityImpactComponent>(COMMODITY_IMPACT_TYPE);
      if (!impact || impact.stabilityPenalty <= 0) continue;

      const stabilityComp = country.getComponent<GovernmentStabilityComponent>(GOVERNMENT_STABILITY_TYPE);
      if (stabilityComp) {
        const newStability = Math.max(
          STABILITY_FLOOR,
          Math.min(STABILITY_CEILING, stabilityComp.stabilityIndex - impact.stabilityPenalty),
        );

        if (newStability !== stabilityComp.stabilityIndex) {
          state.updateComponent(country.id, {
            ...stabilityComp,
            stabilityIndex: newStability,
          } as unknown as IComponent);

          eventBus.publish<IPoliticsStabilityChangedPayload>(
            POLITICS_STABILITY_CHANGED_EVENT,
            {
              countryId: country.id,
              previousStability: stabilityComp.stabilityIndex,
              newStability,
              delta: newStability - stabilityComp.stabilityIndex,
            },
            COMMODITY_IMPACT_SYSTEM_ID,
            country.id,
          );
        }
      }

      const forces = country.getComponent<MilitaryForcesComponent>(MILITARY_FORCES_TYPE);
      if (forces && impact.recruitmentCostMultiplier > 1.0) {
        const adjustedForceLimit = Math.floor(forces.forceLimit / impact.recruitmentCostMultiplier);
        if (adjustedForceLimit !== forces.forceLimit) {
          state.updateComponent(country.id, {
            ...forces,
            forceLimit: adjustedForceLimit,
          } as unknown as IComponent);
        }
      }
    }
  }
}
