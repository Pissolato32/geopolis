import { describe, it, expect } from 'vitest';
import { buildProviderChain } from './provider.factory.js';
import { HeuristicAgentProvider } from './heuristic.provider.js';
import { MockProvider } from './mock.provider.js';
import { ProviderFallbackChain } from './provider-chain.js';
import { SupabaseAgentMemoryStore, createSupabaseMemoryStore } from '../memory/supabase-memory-store.js';
import { InMemoryAgentMemoryStore } from '../memory/in-memory-memory-store.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';

describe('Provider Factory', () => {
  it('should build a chain with heuristic + mock by default', () => {
    const { chain, heuristic, providers } = buildProviderChain({});
    expect(chain).toBeInstanceOf(ProviderFallbackChain);
    expect(heuristic).toBeInstanceOf(HeuristicAgentProvider);
    expect(providers.length).toBe(2);
    expect(providers[0]).toBeInstanceOf(HeuristicAgentProvider);
    expect(providers[1]).toBeInstanceOf(MockProvider);
  });

  it('should include OpenAI provider when apiKey is provided', () => {
    const { providers } = buildProviderChain({
      openaiApiKey: 'test-key',
      includeMock: false,
    });
    expect(providers.length).toBe(2);
    expect(providers[0]).toBeInstanceOf(HeuristicAgentProvider);
  });

  it('should include Ollama provider when endpoint is provided', () => {
    const { providers } = buildProviderChain({
      ollamaEndpoint: 'http://localhost:11434/api/generate',
      includeMock: false,
    });
    expect(providers.length).toBe(2);
    expect(providers[0]).toBeInstanceOf(HeuristicAgentProvider);
  });

  it('should include all providers when all configs are provided', () => {
    const { providers } = buildProviderChain({
      openaiApiKey: 'test-key',
      ollamaEndpoint: 'http://localhost:11434/api/generate',
    });
    expect(providers.length).toBe(4);
  });

  it('should always have at least the heuristic provider', () => {
    const { providers } = buildProviderChain({
      includeHeuristic: false,
      includeMock: false,
    });
    expect(providers.length).toBe(1);
    expect(providers[0]).toBeInstanceOf(HeuristicAgentProvider);
  });
});

describe('SupabaseAgentMemoryStore', () => {
  it('createSupabaseMemoryStore should fall back to in-memory when no env vars', () => {
    const originalUrl = process.env['SUPABASE_URL'];
    const originalKey = process.env['SUPABASE_ANON_KEY'];
    const originalViteUrl = process.env['VITE_SUPABASE_URL'];
    const originalViteKey = process.env['VITE_SUPABASE_ANON_KEY'];
    delete process.env['SUPABASE_URL'];
    delete process.env['SUPABASE_ANON_KEY'];
    delete process.env['VITE_SUPABASE_URL'];
    delete process.env['VITE_SUPABASE_ANON_KEY'];

    const store = createSupabaseMemoryStore();
    expect(store).toBeInstanceOf(InMemoryAgentMemoryStore);

    if (originalUrl) process.env['SUPABASE_URL'] = originalUrl;
    if (originalKey) process.env['SUPABASE_ANON_KEY'] = originalKey;
    if (originalViteUrl) process.env['VITE_SUPABASE_URL'] = originalViteUrl;
    if (originalViteKey) process.env['VITE_SUPABASE_ANON_KEY'] = originalViteKey;
  });

  it('createSupabaseMemoryStore should return Supabase store when env vars are set', () => {
    const originalUrl = process.env['SUPABASE_URL'];
    const originalKey = process.env['SUPABASE_ANON_KEY'];
    process.env['SUPABASE_URL'] = 'https://test.supabase.co';
    process.env['SUPABASE_ANON_KEY'] = 'test-key';

    const store = createSupabaseMemoryStore();
    expect(store).toBeInstanceOf(SupabaseAgentMemoryStore);

    if (originalUrl) process.env['SUPABASE_URL'] = originalUrl;
    else delete process.env['SUPABASE_URL'];
    if (originalKey) process.env['SUPABASE_ANON_KEY'] = originalKey;
    else delete process.env['SUPABASE_ANON_KEY'];
  });

  it('SupabaseAgentMemoryStore should fallback to in-memory for reads when network fails', async () => {
    const store = new SupabaseAgentMemoryStore(
      'https://invalid.test.supabase.co',
      'test-key',
    );
    const countryId = 'country-test' as EntityId;

    store.saveDecision(countryId, {
      tick: 1,
      actionType: 'politics.maintain-stability',
      narrativeSummary: 'Test decision',
      timestamp: Date.now(),
    });

    const decisions = await store.getRecentDecisions(countryId, 10);
    expect(decisions.length).toBeGreaterThanOrEqual(1);
    expect(decisions[0]!.actionType).toBe('politics.maintain-stability');
  }, 15000);
});
