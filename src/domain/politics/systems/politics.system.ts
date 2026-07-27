import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus, ITypedEvent } from '../../../core/interfaces/event-bus.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import {
  GOVERNMENT_STABILITY_TYPE,
  GovernmentStabilityComponent,
} from '../components/politics.components.js';
import {
  WAR_EXHAUSTION_TYPE,
  WarExhaustionComponent,
} from '../components/war-exhaustion.component.js';
import {
  POLITICS_STABILITY_CHANGED_EVENT,
  POLITICS_COUP_RISK_EVENT,
  IPoliticsStabilityChangedPayload,
  IPoliticsCoupRiskPayload,
} from '../events/politics.events.js';
import { ECONOMY_RESOURCE_SHORTAGE_EVENT, IEconomyResourceShortagePayload } from '../../economy/events/economy.events.js';
import {
  WAR_EXHAUSTION_INCREASED_EVENT,
  IWarExhaustionIncreasedPayload,
} from '../../war/events/war.events.js';

export const POLITICS_SYSTEM_ID = 'politics.system';

/**
 * ECS System responsible for political stability, faction dynamics, and coup risk per tick.
 * Priority: 300 (executes after economy, reacts to resource shortages AND war exhaustion via events).
 *
 * War exhaustion integration: subscribes to `war.exhaustion-increased` events.
 * High war exhaustion (>40) actively drains stability and military loyalty.
 * At exhaustion >70, coup risk is elevated.
 */
export class PoliticsSystem implements ISystem {
  readonly descriptor = {
    id: POLITICS_SYSTEM_ID,
    name: 'Politics & Stability System',
    priority: 300 as SystemPriority,
    requiredComponents: [GOVERNMENT_STABILITY_TYPE],
    subscribedEvents: [ECONOMY_RESOURCE_SHORTAGE_EVENT, WAR_EXHAUSTION_INCREASED_EVENT],
    emittedEvents: [POLITICS_STABILITY_CHANGED_EVENT, POLITICS_COUP_RISK_EVENT],
  };

  private pendingShortageImpacts: Map<string, number> = new Map();
  private pendingExhaustionImpacts: Map<string, number> = new Map();

  initialize(eventBus: IEventBus, worldState?: IWorldState): void {
    // Subscribe to economic shortages to reduce political stability
    eventBus.subscribe<IEconomyResourceShortagePayload>(
      ECONOMY_RESOURCE_SHORTAGE_EVENT,
      (event: ITypedEvent<IEconomyResourceShortagePayload>) => {
        const currentImpact = this.pendingShortageImpacts.get(event.payload.countryId) ?? 0;
        this.pendingShortageImpacts.set(event.payload.countryId, currentImpact + 0.02);
      },
    );

    // Subscribe to war exhaustion increases — accumulate stability/morale penalties
    eventBus.subscribe<IWarExhaustionIncreasedPayload>(
      WAR_EXHAUSTION_INCREASED_EVENT,
      (event: ITypedEvent<IWarExhaustionIncreasedPayload>) => {
        const { countryId, newExhaustion, delta } = event.payload;
        // Stability drain scales with exhaustion level
        // At 40+ exhaustion: mild drain; at 70+: severe drain
        let stabilityDrain = 0;
        if (newExhaustion > 70) {
          stabilityDrain = delta * 0.015; // severe
        } else if (newExhaustion > 40) {
          stabilityDrain = delta * 0.008; // moderate
        }
        const current = this.pendingExhaustionImpacts.get(countryId) ?? 0;
        this.pendingExhaustionImpacts.set(countryId, current + stabilityDrain);
      },
    );

    if (worldState) {
      eventBus.subscribe<IPoliticsStabilityChangedPayload>(
        POLITICS_STABILITY_CHANGED_EVENT,
        (event) => {
          const countryId = event.payload.countryId as EntityId;
          if (worldState.hasEntity(countryId)) {
            const entity = worldState.getEntity(countryId);
            const currentComp = entity?.getComponent<GovernmentStabilityComponent>(GOVERNMENT_STABILITY_TYPE);
            if (currentComp) {
              worldState.updateComponent(countryId, {
                ...currentComp,
                stabilityIndex: event.payload.newStability,
              } as unknown as IComponent);
            }
          }
        },
      );
    }
  }

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const countries = state.getEntitiesByComponent(GOVERNMENT_STABILITY_TYPE);

    for (const country of countries) {
      const stabilityComp = country.getComponent<GovernmentStabilityComponent>(GOVERNMENT_STABILITY_TYPE);
      if (!stabilityComp) continue;

      const shortagePenalty = this.pendingShortageImpacts.get(country.id) ?? 0;
      const exhaustionPenalty = this.pendingExhaustionImpacts.get(country.id) ?? 0;
      const naturalDrift = (stabilityComp.approvalRating - 0.5) * 0.01;

      // War exhaustion also reduces military loyalty
      const exhaustionComp = country.getComponent<WarExhaustionComponent>(WAR_EXHAUSTION_TYPE);
      let loyaltyDrain = 0;
      if (exhaustionComp && exhaustionComp.exhaustion > 50) {
        loyaltyDrain = (exhaustionComp.exhaustion - 50) * 0.001;
      }

      const totalDelta = naturalDrift - shortagePenalty - exhaustionPenalty;
      const newStability = Math.min(1.0, Math.max(0.0, stabilityComp.stabilityIndex + totalDelta));

      eventBus.publish<IPoliticsStabilityChangedPayload>(
        POLITICS_STABILITY_CHANGED_EVENT,
        {
          countryId: country.id,
          previousStability: stabilityComp.stabilityIndex,
          newStability,
          delta: totalDelta,
        },
        POLITICS_SYSTEM_ID,
        country.id,
      );

      // Evaluate coup risk — elevated by war exhaustion
      const exhaustionLevel = exhaustionComp?.exhaustion ?? 0;
      const coupThreshold = exhaustionLevel > 70 ? 0.45 : 0.35;
      if (newStability < coupThreshold || stabilityComp.militaryLoyalty - loyaltyDrain < 0.4) {
        eventBus.publish<IPoliticsCoupRiskPayload>(
          POLITICS_COUP_RISK_EVENT,
          {
            countryId: country.id,
            stabilityIndex: newStability,
            militaryLoyalty: stabilityComp.militaryLoyalty,
            riskLevel: newStability < 0.2 || exhaustionLevel > 80 ? 'critical' : 'moderate',
          },
          POLITICS_SYSTEM_ID,
          country.id,
        );
      }
    }

    // Reset temporary impact buffers for next tick
    this.pendingShortageImpacts.clear();
    this.pendingExhaustionImpacts.clear();
  }
}
