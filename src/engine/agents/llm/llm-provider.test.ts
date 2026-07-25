import { describe, it, expect } from 'vitest';
import { MockProvider } from './mock.provider.js';
import { HeuristicAgentProvider } from './heuristic.provider.js';
import { OllamaProvider } from './ollama.provider.js';

describe('MockProvider', () => {
  it('should return default JSON action payload', async () => {
    const provider = new MockProvider();
    const response = await provider.evaluate('any prompt');

    const parsed = JSON.parse(response);
    expect(parsed.actionType).toBe('politics.maintain-stability');
    expect(parsed.actorEntityId).toBe('mock-actor');
    expect(parsed.parameters).toEqual({});
  });

  it('should return configured next response', async () => {
    const provider = new MockProvider();
    provider.setNextResponse(JSON.stringify({
      actionType: 'economy.invest',
      actorEntityId: 'country-br',
      parameters: { amount: 500 },
    }));

    const response = await provider.evaluate('any prompt');
    const parsed = JSON.parse(response);
    expect(parsed.actionType).toBe('economy.invest');
    expect(parsed.parameters.amount).toBe(500);
  });
});

describe('HeuristicAgentProvider', () => {
  it('should decide maintain-stability when stability is low', async () => {
    const provider = new HeuristicAgentProvider({
      countryId: 'country-br',
      metrics: { stabilityIndex: 0.45, treasury: 500, foodOutput: 300,
        lowestAffinity: undefined, lowestAffinityTarget: undefined,
        highestTension: undefined, highestTensionTarget: undefined,
        highestAffinity: undefined, highestAffinityTarget: undefined, gdp: undefined },
    });

    const response = await provider.evaluate('any prompt');
    const parsed = JSON.parse(response);
    expect(parsed.actionType).toBe('politics.maintain-stability');
    expect(parsed.actorEntityId).toBe('country-br');
    expect(parsed.parameters.priority).toBe('high');
  });

  it('should decide economy.invest when treasury is low', async () => {
    const provider = new HeuristicAgentProvider({
      countryId: 'country-us',
      metrics: { stabilityIndex: 0.85, treasury: 150, foodOutput: 300,
        lowestAffinity: undefined, lowestAffinityTarget: undefined,
        highestTension: undefined, highestTensionTarget: undefined,
        highestAffinity: undefined, highestAffinityTarget: undefined, gdp: undefined },
    });

    const response = await provider.evaluate('any prompt');
    const parsed = JSON.parse(response);
    expect(parsed.actionType).toBe('economy.invest');
    expect(parsed.parameters.amount).toBe(15);
  });

  it('should decide impose-sanction when affinity is low and treasury is high', async () => {
    const provider = new HeuristicAgentProvider({
      countryId: 'country-us',
      metrics: { stabilityIndex: 0.85, treasury: 800, foodOutput: 300,
        lowestAffinity: -0.5, lowestAffinityTarget: 'country-br',
        highestTension: 0.3, highestTensionTarget: 'country-br',
        highestAffinity: -0.5, highestAffinityTarget: 'country-br', gdp: undefined },
    });

    const response = await provider.evaluate('any prompt');
    const parsed = JSON.parse(response);
    expect(parsed.actionType).toBe('economy.impose-sanction');
    expect(parsed.parameters.targetCountryId).toBe('country-br');
    expect(parsed.parameters.sanctionType).toBe('trade-embargo');
  });

  it('should decide deploy-unit when tension is high', async () => {
    const provider = new HeuristicAgentProvider({
      countryId: 'country-br',
      metrics: { stabilityIndex: 0.85, treasury: 800, foodOutput: 300,
        lowestAffinity: -0.1, lowestAffinityTarget: 'country-us',
        highestTension: 0.85, highestTensionTarget: 'country-us',
        highestAffinity: -0.1, highestAffinityTarget: 'country-us', gdp: undefined },
    });

    const response = await provider.evaluate('any prompt');
    const parsed = JSON.parse(response);
    expect(parsed.actionType).toBe('military.deploy-unit');
    expect(parsed.parameters.targetCountryId).toBe('country-us');
    expect(parsed.parameters.personnel).toBe(10000);
  });

  it('should decide establish-trade-route when ally affinity high and food scarce', async () => {
    const provider = new HeuristicAgentProvider({
      countryId: 'country-br',
      metrics: { stabilityIndex: 0.85, treasury: 800, foodOutput: 100,
        lowestAffinity: 0.6, lowestAffinityTarget: 'country-us',
        highestTension: 0.1, highestTensionTarget: 'country-us',
        highestAffinity: 0.6, highestAffinityTarget: 'country-us', gdp: undefined },
    });

    const response = await provider.evaluate('any prompt');
    const parsed = JSON.parse(response);
    expect(parsed.actionType).toBe('economy.establish-trade-route');
    expect(parsed.parameters.targetCountryId).toBe('country-us');
    expect(parsed.parameters.resourceType).toBe('food');
    expect(parsed.parameters.volumePerTick).toBe(5);
  });

  it('should default to maintain-stability when all metrics are healthy', async () => {
    const provider = new HeuristicAgentProvider({
      countryId: 'country-us',
      metrics: { stabilityIndex: 0.85, treasury: 800, foodOutput: 300,
        lowestAffinity: 0.0, lowestAffinityTarget: undefined,
        highestTension: 0.3, highestTensionTarget: undefined,
        highestAffinity: 0.0, highestAffinityTarget: undefined, gdp: undefined },
    });

    const response = await provider.evaluate('any prompt');
    const parsed = JSON.parse(response);
    expect(parsed.actionType).toBe('politics.maintain-stability');
    expect(parsed.parameters).toEqual({});
  });

  it('should fallback to regex when no context is set', async () => {
    const provider = new HeuristicAgentProvider();
    const prompt = [
      'You are the political leader of country-br.',
      'PERCEIVED WORLD STATE (YAML):',
      '  stabilityIndex: 0.55',
      '  treasury: 300',
    ].join('\n');

    const response = await provider.evaluate(prompt);
    const parsed = JSON.parse(response);
    expect(parsed.actionType).toBe('politics.maintain-stability');
    expect(parsed.actorEntityId).toBe('country-br');
  });

  it('should fallback to safe default when regex finds nothing', async () => {
    const provider = new HeuristicAgentProvider();
    const response = await provider.evaluate('unrelated text without YAML');
    const parsed = JSON.parse(response);
    expect(parsed.actionType).toBe('politics.maintain-stability');
    expect(parsed.actorEntityId).toBe('unknown');
  });

  it('should use setContext to inject metrics per tick', async () => {
    const provider = new HeuristicAgentProvider();
    provider.setContext({
      countryId: 'country-fr',
      metrics: { stabilityIndex: 0.92, treasury: 50, foodOutput: 300,
        lowestAffinity: undefined, lowestAffinityTarget: undefined,
        highestTension: undefined, highestTensionTarget: undefined,
        highestAffinity: undefined, highestAffinityTarget: undefined, gdp: undefined },
    });

    const response = await provider.evaluate('ignore prompt');
    const parsed = JSON.parse(response);
    expect(parsed.actionType).toBe('economy.invest');
    expect(parsed.actorEntityId).toBe('country-fr');
    expect(parsed.parameters.amount).toBe(5);
  });

  it('should prioritize stability over sanction when both conditions are met', async () => {
    const provider = new HeuristicAgentProvider({
      countryId: 'country-br',
      metrics: { stabilityIndex: 0.45, treasury: 800, foodOutput: 300,
        lowestAffinity: -0.5, lowestAffinityTarget: 'country-us',
        highestTension: 0.1, highestTensionTarget: 'country-us',
        highestAffinity: -0.5, highestAffinityTarget: 'country-us', gdp: undefined },
    });

    const response = await provider.evaluate('any prompt');
    const parsed = JSON.parse(response);
    expect(parsed.actionType).toBe('politics.maintain-stability');
  });
});

describe('OllamaProvider', () => {
  it('should throw when Ollama is not running', async () => {
    const provider = new OllamaProvider({
      endpoint: 'http://127.0.0.1:1/api/generate',
      timeoutMs: 100,
    });

    await expect(provider.evaluate('test')).rejects.toThrow();
  });
});
