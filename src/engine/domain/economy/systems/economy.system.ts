import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import {
  ECONOMIC_INDICATOR_TYPE,
  RESOURCE_PRODUCTION_TYPE,
  EconomicIndicatorComponent,
  ResourceProductionComponent,
} from '../components/economy.components.js';
import {
  ECONOMY_GDP_UPDATED_EVENT,
  ECONOMY_RESOURCE_SHORTAGE_EVENT,
  IEconomyGdpUpdatedPayload,
  IEconomyResourceShortagePayload,
} from '../events/economy.events.js';

export const ECONOMY_SYSTEM_ID = 'economy.system';

/**
 * ECS System responsible for economic simulation per tick.
 * Priority: 200 (runs after resource extraction, before politics/diplomacy).
 */
export class EconomySystem implements ISystem {
  readonly descriptor = {
    id: ECONOMY_SYSTEM_ID,
    name: 'Economy Simulation System',
    priority: 200 as SystemPriority,
    requiredComponents: [ECONOMIC_INDICATOR_TYPE],
    subscribedEvents: [ECONOMY_GDP_UPDATED_EVENT],
    emittedEvents: [ECONOMY_GDP_UPDATED_EVENT, ECONOMY_RESOURCE_SHORTAGE_EVENT],
  };

  initialize(eventBus: IEventBus, worldState?: IWorldState): void {
    if (!worldState) return;
    eventBus.subscribe<IEconomyGdpUpdatedPayload>(
      ECONOMY_GDP_UPDATED_EVENT,
      (event) => {
        const countryId = event.payload.countryId as any;
        if (worldState.hasEntity(countryId)) {
          const entity = worldState.getEntity(countryId);
          const currentComp = entity?.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
          if (currentComp) {
            worldState.updateComponent(countryId, {
              ...currentComp,
              gdp: event.payload.newGdp,
            } as unknown as IComponent);
          }
        }
      },
    );
  }

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const countries = state.getEntitiesByComponent(ECONOMIC_INDICATOR_TYPE);

    for (const country of countries) {
      const indicator = country.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
      if (!indicator) continue;

      const production = country.getComponent<ResourceProductionComponent>(RESOURCE_PRODUCTION_TYPE);
      const totalOutput = production
        ? production.industrialOutput + production.energyOutput * 0.5
        : 100;

      const currentGdp = typeof indicator.gdp === 'bigint' ? Number(indicator.gdp) : indicator.gdp;

      // GDP growth: realistic annual rate ~2-5%, scaled per-tick (weekly).
      // Ticks represent weeks, so the annual rate MUST be divided by 52.
      // Production capacity provides a small bonus, inflation subtracts.
      // The growth factor is capped to prevent hyperinflation in mass simulations.
      const productionBonus = Math.min(0.02, (totalOutput / 500) * 0.0001);
      const annualGrowthRate = Math.max(-0.02, Math.min(0.05, productionBonus - indicator.inflationRate * 0.0005));
      const weeklyGrowthRate = annualGrowthRate / 52;
      const newGdp = Math.max(1, currentGdp * (1 + weeklyGrowthRate));

      eventBus.publish<IEconomyGdpUpdatedPayload>(
        ECONOMY_GDP_UPDATED_EVENT,
        {
          countryId: country.id,
          previousGdp: indicator.gdp,
          newGdp,
          gdpGrowthRate: weeklyGrowthRate,
        },
        ECONOMY_SYSTEM_ID,
        country.id,
      );

      // Check for energy resource shortage
      if (production && production.energyOutput < 20) {
        eventBus.publish<IEconomyResourceShortagePayload>(
          ECONOMY_RESOURCE_SHORTAGE_EVENT,
          {
            countryId: country.id,
            resourceType: 'energy',
            deficit: 20 - production.energyOutput,
          },
          ECONOMY_SYSTEM_ID,
          country.id,
        );
      }
    }
  }
}
