import { describe, it, expect } from 'vitest';
import { PerceptionFilter } from './perception-filter.js';
import { WorldState } from '../../core/world-state/world-state.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';
import { ECONOMIC_INDICATOR_TYPE, EconomicIndicatorComponent } from '../../domain/economy/components/economy.components.js';

describe('PerceptionFilter (Fog of War)', () => {
  it('should generate filtered YAML perception context for focal country', () => {
    const worldState = new WorldState('perception-test');

    worldState.createEntity('country-br' as EntityId, [
      {
        type: ECONOMIC_INDICATOR_TYPE,
        gdp: 2170,
        inflationRate: 0.04,
        treasury: 340,
        taxRate: 0.22,
      } as EconomicIndicatorComponent,
    ]);

    const perceptionDump = PerceptionFilter.generatePerceptionDump(
      worldState,
      'country-br' as EntityId,
    );

    expect(perceptionDump).toContain('focal_entity: country-br');
    expect(perceptionDump).toContain('scenario: perception-test');
  });
});
