import { ILlmProvider } from './llm-provider.interface.js';

export interface IOpenAiProviderConfig {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
}

/**
 * OpenAI-compatible LLM provider.
 * Uses the OpenAI Chat Completions API format.
 * Works with any OpenAI-compatible endpoint (OpenAI, Azure, local servers).
 */
export class OpenAiProvider implements ILlmProvider {
  private readonly config: Required<IOpenAiProviderConfig>;

  constructor(config: IOpenAiProviderConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model ?? 'gpt-4o-mini',
      baseUrl: config.baseUrl ?? 'https://api.openai.com/v1',
      maxTokens: config.maxTokens ?? 512,
      temperature: config.temperature ?? 0.7,
    };
  }

  async evaluate(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI API returned empty response');
    }

    return content;
  }
}
