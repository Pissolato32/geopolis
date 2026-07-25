import { describe, it, expect } from 'vitest';
import { SeedPromptGenerator } from './prompt-generator.js';

describe('SeedPromptGenerator (ADR-002)', () => {
  it('generates copy-pasteable initialization prompt containing current date and JSON schema', () => {
    const prompt = SeedPromptGenerator.generateInitializationPrompt('2026-07-24');

    expect(prompt).toContain('Campaign Start Date: 2026-07-24');
    expect(prompt).toContain('REQUIRED JSON SCHEMA');
    expect(prompt).toContain('entityPatches');
    expect(prompt).toContain('Output ONLY a raw valid JSON object');
  });
});
