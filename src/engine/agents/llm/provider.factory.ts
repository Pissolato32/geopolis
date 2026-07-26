import { ILlmProvider } from './llm-provider.interface.js';
import { HeuristicAgentProvider } from './heuristic.provider.js';
import { MockProvider } from './mock.provider.js';
import { OllamaProvider } from './ollama.provider.js';
import { OpenAiProvider } from './openai.provider.js';
import { ProviderFallbackChain } from './provider-chain.js';

export interface IProviderFactoryConfig {
  /** OpenAI API key. If set, OpenAI is added to the chain. */
  readonly openaiApiKey?: string;
  readonly openaiModel?: string;
  readonly openaiBaseUrl?: string;
  /** Ollama endpoint. If set, Ollama is added to the chain. */
  readonly ollamaEndpoint?: string;
  readonly ollamaModel?: string;
  /** Whether to include the mock provider at the end of the chain. */
  readonly includeMock?: boolean;
  /** Whether to include the heuristic provider at the front of the chain. */
  readonly includeHeuristic?: boolean;
}

export interface IResolvedProviders {
  /** The full fallback chain — use for async evaluation paths. */
  readonly chain: ProviderFallbackChain;
  /** The heuristic provider — use for sync evaluation paths. */
  readonly heuristic: HeuristicAgentProvider;
  /** All providers in chain order, for diagnostics. */
  readonly providers: ILlmProvider[];
}

export function buildProviderChain(config: IProviderFactoryConfig = {}): IResolvedProviders {
  const heuristic = new HeuristicAgentProvider();
  const providers: ILlmProvider[] = [];

  if (config.includeHeuristic !== false) {
    providers.push(heuristic);
  }

  if (config.openaiApiKey) {
    providers.push(new OpenAiProvider({
      apiKey: config.openaiApiKey,
      model: config.openaiModel,
      baseUrl: config.openaiBaseUrl,
    }));
  }

  if (config.ollamaEndpoint !== undefined || process.env['OLLAMA_ENDPOINT']) {
    providers.push(new OllamaProvider({
      endpoint: config.ollamaEndpoint ?? process.env['OLLAMA_ENDPOINT'],
      model: config.ollamaModel ?? process.env['OLLAMA_MODEL'],
    }));
  }

  if (config.includeMock !== false) {
    providers.push(new MockProvider());
  }

  if (providers.length === 0) {
    providers.push(heuristic);
  }

  const chain = new ProviderFallbackChain(
    providers.map((p) => ({ provider: p, maxRetries: 1, timeoutMs: 5000 })),
  );

  return { chain, heuristic, providers };
}
