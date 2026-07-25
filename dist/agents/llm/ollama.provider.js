export class OllamaProvider {
    endpoint;
    model;
    timeoutMs;
    constructor(config = {}) {
        this.endpoint = config.endpoint ?? 'http://localhost:11434/api/generate';
        this.model = config.model ?? 'llama3.2';
        this.timeoutMs = config.timeoutMs ?? 30_000;
    }
    async evaluate(prompt, systemPrompt) {
        const body = {
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
            const data = (await response.json());
            return data.response;
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
//# sourceMappingURL=ollama.provider.js.map