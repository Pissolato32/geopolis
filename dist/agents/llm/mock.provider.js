export class MockProvider {
    nextResponse = JSON.stringify({
        actionType: 'politics.maintain-stability',
        actorEntityId: 'mock-actor',
        parameters: {},
        narrativeSummary: 'Maintained governance stability',
    });
    setNextResponse(response) {
        this.nextResponse = response;
    }
    async evaluate(_prompt, _systemPrompt) {
        return this.nextResponse;
    }
}
//# sourceMappingURL=mock.provider.js.map