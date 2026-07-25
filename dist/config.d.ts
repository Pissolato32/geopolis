export interface IEngineConfig {
    mode: 'headless' | 'server' | 'repl';
    host: string;
    port: number;
    seedPath: string;
    headlessTicks: number;
    scenarioPath?: string | undefined;
}
export declare function loadConfig(overrides?: Partial<IEngineConfig>): IEngineConfig;
export declare function loadSeedFromFile(path: string): unknown;
//# sourceMappingURL=config.d.ts.map