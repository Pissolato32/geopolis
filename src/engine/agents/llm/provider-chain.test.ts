import { describe, it, expect } from 'vitest';
import { ProviderFallbackChain } from './provider-chain.js';
import { MockProvider } from './mock.provider.js';
import { ILlmProvider } from './llm-provider.interface.js';

class FailingProvider implements ILlmProvider {
  constructor(private error: string = 'provider failed') {}
  async evaluate(_prompt: string, _systemPrompt?: string): Promise<string> {
    throw new Error(this.error);
  }
}

describe('ProviderFallbackChain', () => {
  it('should return result from first provider on success', async () => {
    const mock = new MockProvider();
    const chain = new ProviderFallbackChain([
      { provider: mock, maxRetries: 1, timeoutMs: 1000 },
    ]);

    const result = await chain.evaluate('test prompt', 'system prompt');
    expect(result).toContain('maintain-stability');
  });

  it('should fall back to second provider when first fails', async () => {
    const mock = new MockProvider();
    mock.setNextResponse(JSON.stringify({ actionType: 'economy.invest', actorEntityId: 'test', parameters: { amount: 100 }, narrativeSummary: 'invested' }));
    const chain = new ProviderFallbackChain([
      { provider: new FailingProvider(), maxRetries: 1, timeoutMs: 100 },
      { provider: mock, maxRetries: 1, timeoutMs: 1000 },
    ]);

    const result = await chain.evaluate('test prompt');
    expect(result).toContain('economy.invest');
  });

  it('should retry within a provider before moving to next', async () => {
    let attempts = 0;
    const flaky: ILlmProvider = {
      async evaluate(_p: string, _s?: string): Promise<string> {
        attempts++;
        if (attempts < 3) throw new Error('not yet');
        return 'success';
      },
    };

    const chain = new ProviderFallbackChain([
      { provider: flaky, maxRetries: 3, timeoutMs: 1000 },
    ]);

    const result = await chain.evaluate('test');
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should throw when all providers exhaust retries', async () => {
    const chain = new ProviderFallbackChain([
      { provider: new FailingProvider('fail-1'), maxRetries: 1, timeoutMs: 50 },
      { provider: new FailingProvider('fail-2'), maxRetries: 1, timeoutMs: 50 },
    ]);

    await expect(chain.evaluate('test')).rejects.toThrow();
  }, 15000);

  it('should track call and failure statistics', async () => {
    const chain = new ProviderFallbackChain([
      { provider: new FailingProvider(), maxRetries: 1, timeoutMs: 100 },
    ]);

    try { await chain.evaluate('test'); } catch { /* expected */ }

    const stats = chain.getStats();
    expect(stats.totalCalls).toBe(1);
    expect(stats.totalFailures).toBe(1);
  });

  it('should handle empty entries array by throwing', () => {
    expect(() => new ProviderFallbackChain([])).toThrow();
  });
});
