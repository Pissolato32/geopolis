import { describe, it, expect } from 'vitest';
import { SeedSanitizer } from './seed-sanitizer.js';

describe('SeedSanitizer (ADR-002)', () => {
  it('resolves raw IDs and common aliases to canonical engine EntityId', () => {
    expect(SeedSanitizer.canonicalizeEntityId('USA')).toBe('country-us');
    expect(SeedSanitizer.canonicalizeEntityId('EUA')).toBe('country-us');
    expect(SeedSanitizer.canonicalizeEntityId('country-usa')).toBe('country-us');
    expect(SeedSanitizer.canonicalizeEntityId('Brasil')).toBe('country-br');
    expect(SeedSanitizer.canonicalizeEntityId('Brazil')).toBe('country-br');
    expect(SeedSanitizer.canonicalizeEntityId('country-br')).toBe('country-br');
  });

  it('normalizes fraction inputs (85% or 85 -> 0.85)', () => {
    expect(SeedSanitizer.normalizeFraction(85)).toBe(0.85);
    expect(SeedSanitizer.normalizeFraction('85%')).toBe(0.85);
    expect(SeedSanitizer.normalizeFraction(0.85)).toBe(0.85);
  });

  it('clamps numbers within min/max bounds', () => {
    expect(SeedSanitizer.clampNumber(1.5, 0.0, 1.0)).toBe(1.0);
    expect(SeedSanitizer.clampNumber(-0.2, 0.0, 1.0)).toBe(0.0);
    expect(SeedSanitizer.clampNumber(0.75, 0.0, 1.0)).toBe(0.75);
  });

  it('sanitizes incoming raw LLM BYOD payload and generates sanitization report', () => {
    const rawPayload = {
      scenarioId: 'byod-2026',
      entityPatches: [
        {
          id: 'USA', // Alias -> country-us
          components: [
            {
              type: 'politics.stability',
              stabilityIndex: 85, // Scale 85 -> 0.85
              approvalRating: '75%', // String fraction '75%' -> 0.75
            },
          ],
        },
      ],
    };

    const { sanitizedPayload, report } = SeedSanitizer.sanitizeDeltaPayload(rawPayload);

    expect(sanitizedPayload.entityPatches).toHaveLength(1);
    expect(sanitizedPayload.entityPatches[0]!.id).toBe('country-us');

    const comp = sanitizedPayload.entityPatches[0]!.components[0] as unknown as Record<string, number>;
    expect(comp['stabilityIndex']).toBe(0.85);
    expect(comp['approvalRating']).toBe(0.75);

    expect(report.aliasesResolved).toHaveLength(1);
    expect(report.aliasesResolved[0]!).toEqual({ rawId: 'USA', canonicalId: 'country-us' });
    expect(report.valuesClamped.length).toBeGreaterThanOrEqual(1);
  });
});
