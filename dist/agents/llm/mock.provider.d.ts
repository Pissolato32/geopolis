import { ILlmProvider } from './llm-provider.interface.js';
export declare class MockProvider implements ILlmProvider {
    private nextResponse;
    setNextResponse(response: string): void;
    evaluate(_prompt: string, _systemPrompt?: string): Promise<string>;
}
//# sourceMappingURL=mock.provider.d.ts.map