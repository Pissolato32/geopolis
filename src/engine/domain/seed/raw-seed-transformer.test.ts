import { describe, it, expect } from 'vitest';
import { transformRawSeed } from './raw-seed-transformer.js';
import { IComponent } from '../../core/interfaces/component.interface.js';
import type { WorldSeed, Country } from '../../../shared/types.js';
import {
  ECONOMIC_INDICATOR_TYPE,
  RESOURCE_PRODUCTION_TYPE,
} from '../economy/components/economy.components.js';
import {
  GOVERNMENT_STABILITY_TYPE,
} from '../politics/components/politics.components.js';
import {
  INTELLIGENCE_AGENCY_TYPE,
} from '../intelligence/components/intelligence.components.js';
import {
  MILITARY_FORCES_TYPE,
} from '../war/components/military-forces.component.js';

function makeCountry(overrides: Partial<Country> = {}): Country {
  return {
    id: 'USA',
    numericCode: '840',
    name: 'United States',
    flag: 'https://flagcdn.com/w320/us.png',
    latlng: [38, -97],
    region: 'Americas',
    subregion: 'Northern America',
    population: 331000000,
    economy: {
      gdp: 21000000000000,
      gdpPerCapita: 63458,
      treasury: 500000000000,
      taxRate: 0.27,
      stability: 72,
    },
    military: {
      totalPersonnel: 1400000,
      readiness: 85,
      morale: 75,
      forceLimit: 462000,
    },
    posture: 'diplomatic',
    relationships: [
      { countryCode: 'CAN', affinity: 80, tension: 10 },
      { countryCode: 'RUS', affinity: -70, tension: 85 },
    ],
    ...overrides,
  };
}

describe('Raw Seed Transformer', () => {
  it('should transform a raw WorldSeed into IWorldSeed format', () => {
    const raw: WorldSeed = {
      generatedAt: '2026-07-25T00:00:00Z',
      source: 'test',
      countryCount: 2,
      countries: [makeCountry(), makeCountry({
        id: 'CAN', numericCode: '124', name: 'Canada',
        latlng: [56, -106], region: 'Americas', population: 38000000,
        economy: { gdp: 1800000000000, gdpPerCapita: 47368, treasury: 40000000000, taxRate: 0.31, stability: 88 },
        military: { totalPersonnel: 90000, readiness: 70, morale: 80, forceLimit: 29700 },
        posture: 'diplomatic',
        relationships: [{ countryCode: 'USA', affinity: 80, tension: 10 }],
      })],
    };

    const seed = transformRawSeed(raw);

    expect(seed.scenarioId).toBe('modern-world-2026');
    expect(seed.startDate).toBe('2026-07-24');
    expect(seed.initialEntities.length).toBe(2);
    expect(seed.initialEntities[0]!.id).toBe('USA');
    expect(seed.initialEntities[0]!.name).toBe('United States');
    expect(seed.initialEntities[0]!.entityType).toBe('country');
  });

  it('should create all 5 component types per country', () => {
    const raw: WorldSeed = {
      generatedAt: '2026-07-25T00:00:00Z',
      source: 'test',
      countryCount: 1,
      countries: [makeCountry()],
    };

    const seed = transformRawSeed(raw);
    const entity = seed.initialEntities[0]!;
    const types = entity.components.map((c: IComponent) => c.type);

    expect(types).toContain(ECONOMIC_INDICATOR_TYPE);
    expect(types).toContain(RESOURCE_PRODUCTION_TYPE);
    expect(types).toContain(GOVERNMENT_STABILITY_TYPE);
    expect(types).toContain(MILITARY_FORCES_TYPE);
    expect(types).toContain(INTELLIGENCE_AGENCY_TYPE);
    expect(entity.components.length).toBe(5);
  });

  it('should convert economy fields correctly', () => {
    const raw: WorldSeed = {
      generatedAt: '2026-07-25T00:00:00Z',
      source: 'test',
      countryCount: 1,
      countries: [makeCountry()],
    };

    const seed = transformRawSeed(raw);
    const econ = seed.initialEntities[0]!.components.find(
      (c: { type: string }) => c.type === ECONOMIC_INDICATOR_TYPE,
    ) as unknown as Record<string, unknown>;

    expect(econ['gdp']).toBeTypeOf('bigint');
    expect(BigInt(econ['gdp'] as bigint)).toBe(21000000000000n);
    expect(econ['taxRate']).toBe(0.27);
  });

  it('should normalize stability from 0-100 to 0-1', () => {
    const raw: WorldSeed = {
      generatedAt: '2026-07-25T00:00:00Z',
      source: 'test',
      countryCount: 1,
      countries: [makeCountry({ economy: { gdp: 1000, gdpPerCapita: 10, treasury: 100, taxRate: 0.2, stability: 72 } })],
    };

    const seed = transformRawSeed(raw);
    const stability = seed.initialEntities[0]!.components.find(
      (c: { type: string }) => c.type === GOVERNMENT_STABILITY_TYPE,
    ) as unknown as Record<string, unknown>;

    expect(stability['stabilityIndex']).toBeCloseTo(0.72, 2);
  });

  it('should normalize military readiness and morale from 0-100 to 0-1', () => {
    const raw: WorldSeed = {
      generatedAt: '2026-07-25T00:00:00Z',
      source: 'test',
      countryCount: 1,
      countries: [makeCountry({ military: { totalPersonnel: 1000, readiness: 85, morale: 60, forceLimit: 330 } })],
    };

    const seed = transformRawSeed(raw);
    const forces = seed.initialEntities[0]!.components.find(
      (c: { type: string }) => c.type === MILITARY_FORCES_TYPE,
    ) as unknown as Record<string, unknown>;

    expect(forces['readiness']).toBeCloseTo(0.85, 2);
    expect(forces['morale']).toBeCloseTo(0.6, 2);
    expect(forces['totalPersonnel']).toBe(1000);
    expect(forces['forceLimit']).toBe(330);
  });

  it('should set intelligence capability based on GDP and military readiness', () => {
    const raw: WorldSeed = {
      generatedAt: '2026-07-25T00:00:00Z',
      source: 'test',
      countryCount: 1,
      countries: [makeCountry()],
    };

    const seed = transformRawSeed(raw);
    const intel = seed.initialEntities[0]!.components.find(
      (c: { type: string }) => c.type === INTELLIGENCE_AGENCY_TYPE,
    ) as unknown as Record<string, unknown>;

    expect(intel['sigintCapability']).toBeGreaterThan(0);
    expect(intel['sigintCapability']).toBeLessThanOrEqual(1);
    expect(intel['osintCapability']).toBeGreaterThan(0);
    expect(intel['osintCapability']).toBeLessThanOrEqual(1);
  });

  it('should transform relationships into IRelationSeed array', () => {
    const raw: WorldSeed = {
      generatedAt: '2026-07-25T00:00:00Z',
      source: 'test',
      countryCount: 2,
      countries: [
        makeCountry({ relationships: [{ countryCode: 'CAN', affinity: 80, tension: 10 }] }),
        makeCountry({ id: 'CAN', relationships: [{ countryCode: 'USA', affinity: 80, tension: 10 }] }),
      ],
    };

    const seed = transformRawSeed(raw);

    expect(seed.initialRelations.length).toBe(2);
    expect(seed.initialRelations[0]!.sourceEntityId).toBe('USA');
    expect(seed.initialRelations[0]!.targetEntityId).toBe('CAN');
    expect(seed.initialRelations[0]!.affinity).toBeCloseTo(0.8, 2);
    expect(seed.initialRelations[0]!.tension).toBeCloseTo(0.1, 2);
    expect(seed.initialRelations[0]!.recognition).toBe('full');
  });

  it('should clamp out-of-range values', () => {
    const raw: WorldSeed = {
      generatedAt: '2026-07-25T00:00:00Z',
      source: 'test',
      countryCount: 1,
      countries: [makeCountry({
        economy: { gdp: 1000, gdpPerCapita: 10, treasury: 100, taxRate: 0.2, stability: 150 },
        military: { totalPersonnel: 100, readiness: 200, morale: -20, forceLimit: 33 },
      })],
    };

    const seed = transformRawSeed(raw);
    const stability = seed.initialEntities[0]!.components.find(
      (c: { type: string }) => c.type === GOVERNMENT_STABILITY_TYPE,
    ) as unknown as Record<string, unknown>;
    const forces = seed.initialEntities[0]!.components.find(
      (c: { type: string }) => c.type === MILITARY_FORCES_TYPE,
    ) as unknown as Record<string, unknown>;

    expect(stability['stabilityIndex']).toBe(1.0);
    expect(forces['readiness']).toBe(1.0);
    expect(forces['morale']).toBe(0);
  });

  it('should handle the full 246-country seed file', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const path = resolve(process.cwd(), 'data', 'world-seed-2026.json');
    const raw = JSON.parse(readFileSync(path, 'utf8')) as WorldSeed;

    const seed = transformRawSeed(raw);

    expect(seed.initialEntities.length).toBe(raw.countryCount);
    expect(seed.initialEntities.length).toBeGreaterThanOrEqual(240);
    expect(seed.initialRelations.length).toBeGreaterThan(100);
  });
});
