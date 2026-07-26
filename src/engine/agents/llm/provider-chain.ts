import { ILlmProvider } from './llm-provider.interface.js';

export interface IProviderChainEntry {
  readonly provider: ILlmProvider;
  readonly maxRetries: number;
  readonly timeoutMs: number;
}

/**
 * Provider fallback chain — tries providers in order until one succeeds.
 * Implements retry with exponential backoff, timeout, and automatic failover.
 */
export class ProviderFallbackChain implements ILlmProvider {
  private readonly entries: IProviderChainEntry[];
  private totalCalls = 0;
  private totalFailures = 0;

  constructor(entries: IProviderChainEntry[]) {
    if (entries.length === 0) {
      throw new Error('ProviderFallbackChain requires at least one provider entry');
    }
    this.entries = entries;
  }

  async evaluate(prompt: string, systemPrompt?: string): Promise<string> {
    this.totalCalls++;
    let lastError: Error | undefined;

    for (const entry of this.entries) {
      for (let attempt = 0; attempt <= entry.maxRetries; attempt++) {
        try {
          const result = await this.evaluateWithTimeout(entry, prompt, systemPrompt);
          return result;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (attempt < entry.maxRetries) {
            const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000);
            await this.sleep(backoffMs);
          }
        }
      }
    }

    this.totalFailures++;
    throw lastError ?? new Error('All providers failed');
  }

  getStats(): { totalCalls: number; totalFailures: number } {
    return { totalCalls: this.totalCalls, totalFailures: this.totalFailures };
  }

  private async evaluateWithTimeout(
    entry: IProviderChainEntry,
    prompt: string,
    systemPrompt?: string,
  ): Promise<string> {
    if (entry.timeoutMs <= 0) {
      return entry.provider.evaluate(prompt, systemPrompt);
    }

    return Promise.race([
      entry.provider.evaluate(prompt, systemPrompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Provider timed out after ${entry.timeoutMs}ms`)), entry.timeoutMs),
      ),
    ]);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
