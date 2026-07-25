export interface ILlmProvider {
  evaluate(prompt: string, systemPrompt?: string): Promise<string>;
}
