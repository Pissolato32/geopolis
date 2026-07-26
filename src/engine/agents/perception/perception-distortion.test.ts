import { describe, it, expect } from 'vitest';
import { WorldState } from '../../core/world-state/world-state.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';
import { IComponent } from '../../core/interfaces/component.interface.js';
import { PerceptionFilter } from './perception-filter.js';
import { ECONOMIC_INDICATOR_TYPE } from '../../domain/economy/components/economy.components.js';

describe('PerceptionFilter Distortion', () => {
  it('should return raw dump unchanged at high intel level (0.9)', () => {
    const worldState = new WorldState('perception-high');
    const countryId = 'country-br' as EntityId;
    worldState.createEntity(countryId, [{
      type: ECONOMIC_INDICATOR_TYPE,
      gdp: 1000n, treasury: 500n, taxRate: 0.2,
      inflationRate: 0.02, unemploymentRate: 0.05,
      foodOutput: 300, resourceOutput: 200,
      stabilityIndex: 0.7, tradeBalance: 0, consumerConfidence: 0.6,
    } as unknown as IComponent]);

    const dump = PerceptionFilter.generatePerceptionDump(worldState, countryId, { intelLevel: 0.9 });
    const distorted = PerceptionFilter.distort(dump, 0.9);
    expect(distorted).toBe(dump);
  });

  it('should add noise to numeric values at medium intel level (0.5)', () => {
    const raw = 'stabilityIndex: 0.70\ntreasury: 500\ngdp: 1000';
    const distorted = PerceptionFilter.distort(raw, 0.5);
    expect(distorted).toContain('stabilityIndex:');
    expect(distorted).toContain('treasury:');
    expect(distorted).toContain('gdp:');
  });

  it('should redact sensitive fields at low intel level (0.1)', () => {
    const raw = 'country-br:\n  treasury: 500\n  fuelreserves: 10\n  morale: 0.8\n  stabilityIndex: 0.7';
    const distorted = PerceptionFilter.distort(raw, 0.1);
    expect(distorted).toContain('[REDACTED]');
  });

  it('should classify numeric values into range labels at low intel level', () => {
    const raw = 'stabilityIndex: 0.75\ntension: 0.85\nreadiness: 0.5\naffinity: 0.4';
    const distorted = PerceptionFilter.distort(raw, 0.1);
    expect(distorted).toContain('STABLE');
    expect(distorted).toContain('HIGH');
  });

  it('should classify hostile affinity correctly', () => {
    const raw = 'affinity: -0.5';
    const distorted = PerceptionFilter.distort(raw, 0.1);
    expect(distorted).toContain('HOSTILE');
  });

  it('should classify neutral affinity correctly', () => {
    const raw = 'affinity: -0.1';
    const distorted = PerceptionFilter.distort(raw, 0.1);
    expect(distorted).toContain('NEUTRAL');
  });

  it('should classify friendly affinity correctly', () => {
    const raw = 'affinity: 0.5';
    const distorted = PerceptionFilter.distort(raw, 0.1);
    expect(distorted).toContain('FRIENDLY');
  });

  it('should produce deterministic distortion for same input', () => {
    const raw = 'stabilityIndex: 0.70\ntreasury: 500';
    const d1 = PerceptionFilter.distort(raw, 0.5);
    const d2 = PerceptionFilter.distort(raw, 0.5);
    expect(d1).toBe(d2);
  });
});
