import { ILlmProvider } from './llm-provider.interface.js';

export interface IOllamaProviderConfig {
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
}

interface IOllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  stream: boolean;
}

interface IOllamaGenerateResponse {
  response: string;
}

export class OllamaProvider implements ILlmProvider {
  private readonly endpoint: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(config: IOllamaProviderConfig = {}) {
    this.endpoint = config.endpoint ?? 'http://localhost:11434/api/generate';
    this.model = config.model ?? 'llama3.2';
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  async evaluate(prompt: string, systemPrompt?: string): Promise<string> {
    const body: IOllamaGenerateRequest = {
      model: this.model,
      prompt,
      stream: false,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama API returned ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as IOllamaGenerateResponse;
      return data.response;
    } finally {
      clearTimeout(timeout);
    }
  }
}
