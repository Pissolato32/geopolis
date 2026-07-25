import { ILlmProvider } from './llm-provider.interface.js';
export interface IHeuristicContext {
    countryId: string;
    metrics: {
        stabilityIndex: number | undefined;
        treasury: number | undefined;
        gdp: number | undefined;
        foodOutput: number | undefined;
        lowestAffinity: number | undefined;
        lowestAffinityTarget: string | undefined;
        highestTension: number | undefined;
        highestTensionTarget: string | undefined;
        highestAffinity: number | undefined;
        highestAffinityTarget: string | undefined;
    };
}
export declare class HeuristicAgentProvider implements ILlmProvider {
    private context;
    constructor(context?: IHeuristicContext);
    setContext(context: IHeuristicContext): void;
    clearContext(): void;
    evaluate(prompt: string, _systemPrompt?: string): Promise<string>;
    private decide;
    private extractFromPrompt;
}
//# sourceMappingURL=heuristic.provider.d.ts.map