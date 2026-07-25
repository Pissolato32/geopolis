import { describe, it, expect } from 'vitest';
import { WorldState } from '../../core/world-state/world-state.js';
import { loadWorldSeed } from './seed-loader.js';
import { IWorldSeed } from '../../core/interfaces/world-seed.interface.js';
import { ECONOMIC_INDICATOR_TYPE, EconomicIndicatorComponent } from '../economy/components/economy.components.js';
import { DIPLOMATIC_RELATION_TYPE } from '../diplomacy/components/relation.component.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';

describe('World Seed Loader (ADR-001)', () => {
  it('should load world-seed-2026 establishing ground truth entities and relation graph', () => {
    const worldState = new WorldState('seed-test');

    const mockSeed: IWorldSeed = {
      scenarioId: 'world-seed-2026',
      startDate: '2026-07-24',
      description: 'Test seed',
      initialEntities: [
        {
          id: 'country-br' as EntityId,
          name: 'Brazil',
          entityType: 'country',
          components: [
            {
              type: ECONOMIC_INDICATOR_TYPE,
              gdp: 2170,
              inflationRate: 0.042,
              treasury: 340,
              taxRate: 0.22,
            },
          ],
        },
      ],
      initialRelations: [
        {
          sourceEntityId: 'country-br' as EntityId,
          targetEntityId: 'country-us' as EntityId,
          affinity: 0.65,
          tension: 0.15,
          recognition: 'full',
        },
      ],
    };

    loadWorldSeed(worldState, mockSeed);

    expect(worldState.hasEntity('country-br' as EntityId)).toBe(true);

    const brEntity = worldState.getEntity('country-br' as EntityId);
    expect(brEntity).toBeDefined();
    expect(brEntity!.hasComponent(ECONOMIC_INDICATOR_TYPE)).toBe(true);
    expect(brEntity!.hasComponent(DIPLOMATIC_RELATION_TYPE)).toBe(true);
  });

  it('should support dynamic campaign start date overrides without hardcoded temporal locks', () => {
    const worldState = new WorldState('seed-custom-date');
    const mockSeed: IWorldSeed = {
      scenarioId: 'custom-scenario',
      startDate: '1939-09-01',
      description: 'Historical WWII Scenario',
      initialEntities: [],
      initialRelations: [],
    };

    const result = loadWorldSeed(worldState, mockSeed, undefined, '1941-12-07');
    expect(result.effectiveStartDate).toBe('1941-12-07');
  });

  it('should merge BYOD Delta Patch overrides onto base seed (ADR-002)', () => {
    const worldState = new WorldState('seed-byod-merge');

    const baseSeed: IWorldSeed = {
      scenarioId: 'base-2026',
      startDate: '2026-07-24',
      description: 'Base seed',
      initialEntities: [
        {
          id: 'country-us' as EntityId,
          name: 'United States',
          entityType: 'country',
          components: [
            {
              type: ECONOMIC_INDICATOR_TYPE,
              gdp: 25000,
              inflationRate: 0.03,
              treasury: 1000,
              taxRate: 0.2,
            },
          ],
        },
      ],
      initialRelations: [],
    };

    const deltaPatch = {
      campaignStartDate: '2026-08-01',
      entityPatches: [
        {
          id: 'USA', // Alias -> country-us
          components: [
            {
              type: ECONOMIC_INDICATOR_TYPE,
              gdp: 28700,
              inflationRate: '4.5%', // Clamped 4.5% -> 0.045
              treasury: 1800,
              taxRate: 0.24,
            },
          ],
        },
      ],
    };

    const result = loadWorldSeed(worldState, baseSeed, deltaPatch);

    expect(result.effectiveStartDate).toBe('2026-08-01');
    expect(result.sanitizationReport).toBeDefined();
    expect(result.sanitizationReport!.aliasesResolved).toHaveLength(1);

    const usEntity = worldState.getEntity('country-us' as EntityId);
    expect(usEntity).toBeDefined();

    const econComp = usEntity!.getComponent<EconomicIndicatorComponent>(ECONOMIC_INDICATOR_TYPE);
    expect(econComp?.gdp).toBe(28700);
    expect(econComp?.inflationRate).toBe(0.045);
  });
});
