import { ILlmProvider } from './llm-provider.interface.js';

export class MockProvider implements ILlmProvider {
  private nextResponse: string = JSON.stringify({
    actionType: 'politics.maintain-stability',
    actorEntityId: 'mock-actor',
    parameters: {},
    narrativeSummary: 'Maintained governance stability',
  });

  setNextResponse(response: string): void {
    this.nextResponse = response;
  }

  async evaluate(_prompt: string, _systemPrompt?: string): Promise<string> {
    return this.nextResponse;
  }
}
