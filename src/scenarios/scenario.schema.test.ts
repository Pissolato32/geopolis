import { describe, it, expect } from 'vitest';
import { ScenarioSchemaValidator } from './scenario.validator.js';

describe('ScenarioSchemaValidator', () => {
  const validator = new ScenarioSchemaValidator();

  const validPreset = {
    metadata: {
      name: 'Cold War Escalation',
      version: '1.0.0',
      description: 'A hypothetical Cold War scenario in 2026',
      simulation: { maxTicks: 100, seed: 42 },
    },
    worldState: {
      entities: [
        {
          id: 'country-us',
          name: 'United States',
          entityType: 'country',
          components: [
            { type: 'economy.indicator', gdp: 28700, inflationRate: 0.028, treasury: 1800, taxRate: 0.24 },
            { type: 'politics.stability', stabilityIndex: 0.85, approvalRating: 0.55, militaryLoyalty: 0.95 },
          ],
        },
        {
          id: 'country-br',
          name: 'Brazil',
          entityType: 'country',
          components: [
            { type: 'economy.indicator', gdp: 2170, inflationRate: 0.04, treasury: 800, taxRate: 0.22 },
            { type: 'politics.stability', stabilityIndex: 0.75, approvalRating: 0.55, militaryLoyalty: 0.9 },
          ],
        },
      ],
      relations: [
        {
          sourceEntityId: 'country-us',
          targetEntityId: 'country-br',
          affinity: -0.3,
          tension: 0.6,
          recognition: 'full',
        },
      ],
    },
    eventTriggers: [
      {
        tick: 5,
        eventType: 'economy.market-crash',
        parameters: { severity: 'high', region: 'global' },
      },
      {
        tick: 10,
        eventType: 'politics.coup-attempt',
        parameters: { targetCountryId: 'country-br' },
      },
    ],
  };

  it('should validate a correct scenario preset', () => {
    const result = validator.validate(validPreset);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject null root', () => {
    const result = validator.validate(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.path).toBe('');
  });

  it('should reject missing metadata', () => {
    const result = validator.validate({ worldState: { entities: [] }, eventTriggers: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.startsWith('metadata'))).toBe(true);
  });

  it('should reject missing metadata.name', () => {
    const preset = {
      ...validPreset,
      metadata: { ...validPreset.metadata, name: '' },
    };
    const result = validator.validate(preset);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'metadata.name')).toBe(true);
  });

  it('should reject missing worldState.entities', () => {
    const preset = {
      metadata: validPreset.metadata,
      worldState: {},
      eventTriggers: [],
    };
    const result = validator.validate(preset);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'worldState.entities')).toBe(true);
  });

  it('should reject entity without id', () => {
    const preset = {
      ...validPreset,
      worldState: {
        entities: [{ name: 'Test', entityType: 'country', components: [] }],
        relations: [],
      },
      eventTriggers: [],
    };
    const result = validator.validate(preset);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('.id'))).toBe(true);
  });

  it('should reject entity without components array', () => {
    const preset = {
      ...validPreset,
      worldState: {
        entities: [{ id: 'test-1', name: 'Test', entityType: 'country' }],
        relations: [],
      },
      eventTriggers: [],
    };
    const result = validator.validate(preset);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('.components'))).toBe(true);
  });

  it('should reject component without type', () => {
    const preset = {
      ...validPreset,
      worldState: {
        entities: [{
          id: 'test-1', name: 'Test', entityType: 'country',
          components: [{ gdp: 100 }],
        }],
        relations: [],
      },
      eventTriggers: [],
    };
    const result = validator.validate(preset);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('.type'))).toBe(true);
  });

  it('should reject relation with out-of-range affinity', () => {
    const preset = {
      ...validPreset,
      worldState: {
        entities: validPreset.worldState.entities,
        relations: [{
          sourceEntityId: 'country-us',
          targetEntityId: 'country-br',
          affinity: 1.5,
          tension: 0.5,
          recognition: 'full',
        }],
      },
      eventTriggers: [],
    };
    const result = validator.validate(preset);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('affinity'))).toBe(true);
  });

  it('should reject relation with out-of-range tension', () => {
    const preset = {
      ...validPreset,
      worldState: {
        entities: validPreset.worldState.entities,
        relations: [{
          sourceEntityId: 'country-us',
          targetEntityId: 'country-br',
          affinity: 0.5,
          tension: 1.5,
          recognition: 'full',
        }],
      },
      eventTriggers: [],
    };
    const result = validator.validate(preset);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('tension'))).toBe(true);
  });

  it('should reject event trigger with negative tick', () => {
    const preset = {
      ...validPreset,
      eventTriggers: [{ tick: -1, eventType: 'test.event', parameters: {} }],
    };
    const result = validator.validate(preset);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('tick'))).toBe(true);
  });

  it('should accept preset without eventTriggers', () => {
    const preset = {
      metadata: validPreset.metadata,
      worldState: { entities: validPreset.worldState.entities, relations: [] },
    };
    const result = validator.validate(preset);
    expect(result.valid).toBe(true);
  });

  it('should accept preset without relations', () => {
    const preset = {
      metadata: validPreset.metadata,
      worldState: { entities: validPreset.worldState.entities },
      eventTriggers: [],
    };
    const result = validator.validate(preset);
    expect(result.valid).toBe(true);
  });
});
