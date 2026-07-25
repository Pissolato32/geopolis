import { IScenarioPreset } from './scenario.types.js';
export interface IBenchmarkMetrics {
    scenarioName: string;
    totalTicks: number;
    totalDurationMs: number;
    ticksPerSecond: number;
    avgTickMs: number;
    minTickMs: number;
    maxTickMs: number;
    eventsEmitted: number;
}
export interface IBenchmarkReport {
    metrics: IBenchmarkMetrics;
    eventBreakdown: Record<string, number>;
    systemsExecuted: number;
}
export declare function runBenchmark(preset: IScenarioPreset, tickCount?: number): IBenchmarkReport;
export declare function formatBenchmarkReport(report: IBenchmarkReport): string;
//# sourceMappingURL=benchmark.runner.d.ts.map