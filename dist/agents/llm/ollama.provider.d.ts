import { ILlmProvider } from './llm-provider.interface.js';
export interface IOllamaProviderConfig {
    endpoint?: string;
    model?: string;
    timeoutMs?: number;
}
export declare class OllamaProvider implements ILlmProvider {
    private readonly endpoint;
    private readonly model;
    private readonly timeoutMs;
    constructor(config?: IOllamaProviderConfig);
    evaluate(prompt: string, systemPrompt?: string): Promise<string>;
}
//# sourceMappingURL=ollama.provider.d.ts.map