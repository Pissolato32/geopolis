import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import {
  DEMOGRAPHIC_TYPE,
  DemographicComponent,
} from '../components/demographic.components.js';
import {
  ECONOMIC_INDICATOR_TYPE,
  EconomicIndicatorComponent,
} from '../../economy/components/economy.components.js';
import {
  GOVERNMENT_STABILITY_TYPE,
  GovernmentStabilityComponent,
} from '../../politics/components/politics.components.js';
import {
  MILITARY_UNIT_TYPE,
  MilitaryUnitComponent,
} from '../../war/components/war.components.js';
import {
  POPULATION_UPDATED_EVENT,
  IPopulationUpdatedPayload,
} from '../events/demographics.events.js';

export const POPULATION_SYSTEM_ID = 'demographics.population';

const TICKS_PER_YEAR = 52;

/**
 * Pure function: calculates the weekly population growth rate for a country
 * based on economic health, political stability, and war exhaustion.
 *
 * @param baseAnnualRate - Base annual growth rate (e.g. 0.01 = +1%/year).
 *   Universally an annual figure, so it MUST be divided by 52 per tick.
 * @param economicHealth - 0.0 (collapse) to 1.0 (boom). Affects growth via
 *   a linear modifier: strong economies add up to +0.5% annual, collapsing
 *   ones subtract up to -1.0% annual.
 * @param stabilityIndex - 0.0 (anarchy) to 1.0 (total control). Low stability
 *   drives emigration and mortality, subtracting up to -1.5% annual.
 * @param warExhaustion - 0.0 (at peace) to 1.0 (total war). High exhaustion
 *   drives casualties and displacement, subtracting up to -2.0% annual.
 * @returns The weekly growth rate (annual rate / 52, with modifiers applied).
 */
export function calculateWeeklyGrowthRate(
  baseAnnualRate: number,
  economicHealth: number,
  stabilityIndex: number,
  warExhaustion: number,
): number {
  // Economic health modifier: +0.5% at boom, -1.0% at collapse
  const economicModifier = (economicHealth - 0.5) * 0.015;

  // Stability modifier: 0 at full stability, -1.5% at anarchy
  const stabilityModifier = -(1 - stabilityIndex) * 0.015;

  // War exhaustion modifier: 0 at peace, -2.0% at total war
  const warModifier = -warExhaustion * 0.02;

  // Clamp the combined annual rate to [-3.5%, +3.0%] to stay realistic
  const annualRate = Math.max(-0.035, Math.min(0.03, baseAnnualRate + economicModifier + stabilityModifier + warModifier));

  // Divide by 52 to convert annual → weekly (1 tick = 1 week)
  return annualRate / TICKS_PER_YEAR;
}

/**
 * Pure function: applies the weekly growth rate to the current population.
 * Returns the new population count, floored at 1.
 */
export function applyWeeklyGrowth(currentPopulation: number, weeklyGrowthRate: number): number {
  const newPop = currentPopulation * (1 + weeklyGrowthRate);
  return Math.max(1, Math.round(newPop));
}

/**
 * Pure function: computes war exhaustion (0.0 to 1.0) from military readiness
 * and morale. Low readiness + low morale = high exhaustion.
 */
export function computeWarExhaustion(readiness: number, morale: number): number {
  // readiness and morale are 0.0..1.0; exhaustion = 1 - avg(readiness, morale)
  const avg = (readiness + morale) / 2;
  return Math.max(0, Math.min(1, 1 - avg));
}

/**
 * ECS System responsible for organic population dynamics per tick.
 *
 * Calculates population growth or decline based on:
 * - Base annual growth rate (divided by 52 per tick — 1 tick = 1 week)
 * - Economic health (GDP trend via inflation + production)
 * - Political stability (government stability index)
 * - War exhaustion (derived from military readiness and morale)
 *
 * Emits `demographics.population-updated` events. Does NOT mutate state
 * directly — the reducer (registered in initialize) applies the new
 * population count during event resolution.
 *
 * Priority: 150 (runs before economy at 200, so population changes
 * are visible to downstream economic systems in the same tick).
 */
export class PopulationSystem implements ISystem {
  readonly descriptor = {
    id: POPULATION_SYSTEM_ID,
    name: 'Population Dynamics System',
    priority: 150 as SystemPriority,
    requiredComponents: [DEMOGRAPHIC_TYPE],
    subscribedEvents: [POPULATION_UPDATED_EVENT],
    emittedEvents: [POPULATION_UPDATED_EVENT],
  };

  initialize(eventBus: IEventBus, worldState?: IWorldState): void {
    if (!worldState) return;
    eventBus.subscribe<IPopulationUpdatedPayload>(
      POPULATION_UPDATED_EVENT,
      (event) => {
        const countryId = event.payload.countryId as EntityId;
        if (worldState.hasEntity(countryId)) {
          const entity = worldState.getEntity(countryId);
          const currentComp = entity?.getComponent<DemographicComponent>(DEMOGRAPHIC_TYPE);
          if (currentComp) {
            worldState.updateComponent(countryId, {
              ...currentComp,
              populationAbsolute: event.payload.newPopulation,
              activeWorkforce: Math.round(
                (typeof event.payload.newPopulation === "bigint"
                  ? Number(event.payload.newPopulation)
                  : event.payload.newPopulation) * 0.5,
              ),
            } as unknown as IComponent);
          }
        }
      },
    );
  }

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const entities = state.getEntitiesByComponent(DEMOGRAPHIC_TYPE);

    for (const entity of entities) {
      const demo = entity.getComponent<DemographicComponent>(DEMOGRAPHIC_TYPE);
      if (!demo) continue;

      const currentPop = typeof demo.populationAbsolute === "bigint"
        ? Number(demo.populationAbsolute)
        : demo.populationAbsolute;

      // Derive economic health from the EconomicIndicator component (inflation rate)
      const econ = entity.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
      const economicHealth = econ
        ? Math.max(0, Math.min(1, 1 - econ.inflationRate * 5))
        : 0.5;

      // Derive stability from the GovernmentStability component
      const gov = entity.getComponent<GovernmentStabilityComponent>(GOVERNMENT_STABILITY_TYPE);
      const stabilityIndex = gov ? gov.stabilityIndex : demo.stabilityIndex;

      // Derive war exhaustion from the military unit component (if present)
      const milEntity = state.getEntitiesByComponent(MILITARY_UNIT_TYPE)
        .find((e) => {
          const m = e.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
          return m?.ownerCountryId === entity.id;
        });
      let warExhaustion = 0;
      if (milEntity) {
        const mil = milEntity.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
        if (mil) {
          warExhaustion = computeWarExhaustion(mil.readiness, mil.morale);
        }
      }

      const weeklyGrowthRate = calculateWeeklyGrowthRate(
        demo.growthRate,
        economicHealth,
        stabilityIndex,
        warExhaustion,
      );

      const newPopulation = applyWeeklyGrowth(currentPop, weeklyGrowthRate);

      eventBus.publish<IPopulationUpdatedPayload>(
        POPULATION_UPDATED_EVENT,
        {
          countryId: entity.id,
          previousPopulation: demo.populationAbsolute,
          newPopulation,
          weeklyGrowthRate,
          growthFactors: {
            economicHealth,
            stabilityFactor: stabilityIndex,
            warExhaustionFactor: warExhaustion,
          },
        },
        POPULATION_SYSTEM_ID,
        entity.id as EntityId,
      );
    }
  }
}
