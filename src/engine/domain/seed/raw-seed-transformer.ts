import { EntityId } from '../../core/interfaces/entity.interface.js';
import { IComponent } from '../../core/interfaces/component.interface.js';
import { IWorldSeed, IEntitySeed, IRelationSeed } from '../../core/interfaces/world-seed.interface.js';
import {
  ECONOMIC_INDICATOR_TYPE,
  RESOURCE_PRODUCTION_TYPE,
} from '../../domain/economy/components/economy.components.js';
import {
  GOVERNMENT_STABILITY_TYPE,
} from '../../domain/politics/components/politics.components.js';
import {
  INTELLIGENCE_AGENCY_TYPE,
} from '../../domain/intelligence/components/intelligence.components.js';
import {
  MILITARY_FORCES_TYPE,
} from '../../domain/war/components/military-forces.component.js';
import type { WorldSeed as RawWorldSeed, Country as RawCountry } from '../../../shared/types.js';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function toComponents(c: RawCountry): IComponent[] {
  const components: IComponent[] = [];

  components.push({
    type: ECONOMIC_INDICATOR_TYPE,
    gdp: BigInt(Math.round(c.economy.gdp)),
    treasury: BigInt(Math.round(c.economy.treasury)),
    taxRate: c.economy.taxRate,
    inflationRate: 0.03,
  } as IComponent);

  components.push({
    type: RESOURCE_PRODUCTION_TYPE,
    energyOutput: Math.round(c.economy.gdp / 1e9 * 0.3),
    foodOutput: Math.round(c.economy.gdp / 1e9 * 0.2),
    mineralsOutput: Math.round(c.economy.gdp / 1e9 * 0.1),
    industrialOutput: Math.round(c.economy.gdp / 1e9 * 0.4),
  } as IComponent);

  components.push({
    type: GOVERNMENT_STABILITY_TYPE,
    stabilityIndex: clamp(c.economy.stability / 100, 0, 1),
    approvalRating: clamp(0.4 + (c.economy.stability / 100 - 0.5) * 0.4, 0, 1),
    militaryLoyalty: clamp(c.military.morale / 100, 0, 1),
  } as IComponent);

  components.push({
    type: MILITARY_FORCES_TYPE,
    ownerCountryId: c.id as EntityId,
    totalPersonnel: c.military.totalPersonnel,
    forceLimit: c.military.forceLimit,
    readiness: clamp(c.military.readiness / 100, 0, 1),
    morale: clamp(c.military.morale / 100, 0, 1),
    fuelReserves: Math.round(c.military.totalPersonnel * 0.02),
  } as IComponent);

  const intelBudget = clamp(
    (Math.log10(c.economy.gdp + 1) / 12) * 0.6 + (c.military.readiness / 100) * 0.3,
    0.1, 0.95,
  );
  components.push({
    type: INTELLIGENCE_AGENCY_TYPE,
    sigintCapability: clamp(intelBudget * 1.1, 0, 1),
    humintCapability: clamp(intelBudget * 0.8, 0, 1),
    osintCapability: clamp(intelBudget * 1.2, 0, 1),
    imintCapability: clamp(intelBudget * 0.9, 0, 1),
    cyberCapability: clamp(intelBudget * 0.7, 0, 1),
  } as IComponent);

  return components;
}

function toEntitySeed(c: RawCountry): IEntitySeed {
  return {
    id: c.id as EntityId,
    name: c.name,
    entityType: 'country',
    components: toComponents(c),
  };
}

function toRelations(seed: RawWorldSeed): IRelationSeed[] {
  const relations: IRelationSeed[] = [];
  for (const c of seed.countries) {
    for (const r of c.relationships) {
      relations.push({
        sourceEntityId: c.id as EntityId,
        targetEntityId: r.countryCode as EntityId,
        affinity: clamp(r.affinity / 100, -1, 1),
        tension: clamp(r.tension / 100, 0, 1),
        recognition: 'full',
      });
    }
  }
  return relations;
}

export function transformRawSeed(raw: RawWorldSeed): IWorldSeed {
  return {
    scenarioId: 'modern-world-2026',
    startDate: '2026-07-24',
    description: raw.source,
    initialEntities: raw.countries.map(toEntitySeed),
    initialRelations: toRelations(raw),
  };
}
